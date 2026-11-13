#!/usr/bin/env node
// Typecast Deploy Manager.
//
// Vercel's Hobby plan allows 100 deployments per rolling 24h. Merges to main no longer deploy by themselves
// (vercel.json: git.deploymentEnabled=false). This script is the only thing that deploys: it looks at what is
// pending on main, waits for a quiet moment so a burst of merges becomes ONE deployment, and paces itself
// against the daily budget. See DEPLOYING.md for the policy and the lessons log.
//
//   node scripts/deploy-manager.mjs [tick] [--dry] [--wait] [--no-poll] [--issue N]
//
//   tick      (default) decide once and act. Exit code is always 0 unless the script itself crashed.
//   --dry     never deploy and never write the status issue; just print the decision.
//   --wait    if the decision is "hold until quiet/max-wait", sleep and re-decide (up to LOOP_MAX_MIN minutes).
//   --no-poll after triggering a deployment, do not wait for it to finish.
//   --issue   status-board issue number (or env STATUS_ISSUE). Without it nothing is written to GitHub.
//
// Auth: env VERCEL_TOKEN (GitHub Actions). If unset, requests go out unauthenticated and the Claude cloud
// proxy injects the credential. GitHub I/O uses the `gh` CLI (GH_TOKEN in Actions, proxy in Claude sessions).

import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------- policy (tune here, record why in DEPLOYING.md)
export const CFG = {
  projectId: 'prj_htusg5FPMRrzdb13rRG8flOxXBdU',
  teamId: 'team_qGoklBrMP6rta9mkHDjVJUMq',
  repoId: 1449507354,
  repo: 'esheliko/typecast',
  branch: 'main',
  dailyLimit: 100, // Hobby: api-deployments-free-per-day (rolling 24h, counts every state)
  reserve: 6, // slots kept back for overdue work / [deploy-now]
  overdueMin: 30, // pending this long => allowed to use the reserve
  minGapMin: 2, // never two deployments closer than this
  // By spendable budget (limit - reserve - used24): how long main must be quiet, and the longest we make a push wait.
  tiers: [
    { minSpendable: 41, quietMin: 3, maxWaitMin: 10 },
    { minSpendable: 1, quietMin: 4, maxWaitMin: 15 }, // Vercel accepted deployments at 150+ in 24h, so a high count is no reason to hold long
  ],

  loopMaxMin: 24, // --wait: longest we sleep inside one run
  pollMaxMin: 9, // longest we watch a build
  sleepSec: 30,
  errorCooldownMin: 45, // after a 402 (limit) response
  // Commits that only touch these never need a deployment.
  noDeploy: /^(.*\.md|\.claude\/.*|\.github\/.*|artifact\.html|supabase\/.*|docs\/.*|scripts\/.*|tests\/.*|playwright\.config\.ts|\.gitignore|\.env\.example)$/,
  urgentTag: '[deploy-now]',
  // The CI gate: the head commit's `verify` check (.github/workflows/ci.yml) must have passed before it is deployed.
  ciCheck: 'verify',
  ciIssue: 2, // issue that scripts/ci-status.mjs keeps up to date: verdict, failing tests, responsible sessions
  ciStartGraceMin: 4, // a head commit younger than this with no verify check yet: CI is about to start, hold
  ciCancelledGraceMin: 3, // a cancelled verify older than this, with no newer run, no longer blocks
  pipelineCacheSec: 120, // PR/branch data is re-read at most this often (the hold loop ticks every 30 s)
  maxPrs: 15, // open PRs inspected one by one (CI + mergeability)
  maxBranches: 10, // branches without a PR inspected (commits ahead of main)
  branchRecentDays: 7, // a branch with no PR only shows while its last commit is this recent
  ciMaxWaitMin: 12, // CI still running this long after the OLDEST pending commit => deploy anyway: no change waits longer than this, burst or not
};

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const DRY = has('--dry');
const WAIT = has('--wait');
const POLL = !has('--no-poll');
const issueArg = argv.indexOf('--issue');
const ISSUE = issueArg >= 0 ? argv[issueArg + 1] : process.env.STATUS_ISSUE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const ago = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? '<1m' : m < 90 ? `${m}m` : `${(m / 60).toFixed(1)}h`;
};
const log = (...a) => console.error('[deploy-manager]', ...a);

// ---------------------------------------------------------------- IO
function curl(method, url, body) {
  const args = ['-sS', '-X', method, '-H', 'content-type: application/json', '-w', '\n%{http_code}', '--max-time', '60'];
  if (process.env.VERCEL_TOKEN) args.push('-H', `Authorization: Bearer ${process.env.VERCEL_TOKEN}`);
  if (body) args.push('--data-binary', '@-');
  args.push(url);
  const out = execFileSync('curl', args, { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', maxBuffer: 64e6 });
  const i = out.lastIndexOf('\n');
  let json = null;
  try { json = JSON.parse(out.slice(0, i)); } catch { /* non-JSON */ }
  return { status: Number(out.slice(i + 1)), json };
}
const vercel = (method, path, body) => {
  const sep = path.includes('?') ? '&' : '?';
  return curl(method, `https://api.vercel.com${path}${sep}teamId=${CFG.teamId}`, body);
};
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64e6 }).trim();
const gitOk = (...a) => { try { git(...a); return true; } catch { return false; } };
function gh(args, input) {
  return execFileSync('gh', args, { input, encoding: 'utf8', maxBuffer: 64e6 });
}

// ---------------------------------------------------------------- state gathering
function deploymentsLast24h() {
  const since = Date.now() - 24 * 3600e3 - 5 * 60e3;
  const all = [];
  let until;
  for (let page = 0; page < 5; page++) {
    const r = vercel('GET', `/v6/deployments?projectId=${CFG.projectId}&limit=100&since=${Math.floor(since)}${until ? `&until=${until}` : ''}`);
    if (r.status !== 200) throw new Error(`list deployments failed: ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
    all.push(...r.json.deployments);
    until = r.json.pagination?.next;
    if (!until) break;
  }
  const seen = new Set();
  return all
    .filter((d) => !seen.has(d.uid) && seen.add(d.uid) && d.created >= since)
    .map((d) => ({ id: d.uid, state: d.readyState ?? d.state, target: d.target, created: d.created, sha: d.meta?.githubCommitSha ?? null }))
    .sort((a, b) => b.created - a.created);
}

function latestReadyProd(list) {
  const hit = list.find((d) => d.target === 'production' && d.state === 'READY');
  if (hit) return hit;
  const r = vercel('GET', `/v6/deployments?projectId=${CFG.projectId}&target=production&state=READY&limit=1`);
  const d = r.json?.deployments?.[0];
  return d ? { id: d.uid, state: 'READY', target: 'production', created: d.created, sha: d.meta?.githubCommitSha ?? null } : null;
}

function pendingCommits(baseSha) {
  try { git('fetch', '-q', 'origin', CFG.branch); } catch (e) { log('git fetch failed', String(e.message).slice(0, 120)); }
  const head = git('rev-parse', `origin/${CFG.branch}`);
  let base = baseSha;
  if (base && !gitOk('cat-file', '-e', `${base}^{commit}`)) base = null; // unknown to this clone
  if (base && !gitOk('merge-base', '--is-ancestor', base, head)) base = git('merge-base', base, head); // history was rewritten
  const range = base ? `${base}..${head}` : `-30 ${head}`;
  const rows = git('log', '--format=%H%x1f%ct%x1f%s', ...range.split(' ')).split('\n').filter(Boolean);
  const raw = rows.map((r) => {
    const [sha, ct, subject] = r.split('\x1f');
    const files = git('show', '--name-only', '--format=', '--no-renames', sha).split('\n').filter(Boolean);
    return { sha, at: Number(ct) * 1000, subject, files, urgent: subject.toLowerCase().includes(CFG.urgentTag) };
  });
  // What actually differs between what is live and main (null when there is no known live commit).
  const net = base ? git('diff', '--name-only', '--no-renames', base, head).split('\n').filter(Boolean) : null;
  const commits = markRelevant(raw, net);
  return { head, commits, relevant: commits.filter((c) => c.relevant), netFiles: net };
}

/**
 * Pure. A commit needs a deployment only if it touched a file that the site is built from AND that file still differs from what is live.
 * Docs, scripts, tests, CI config never count; neither do edits that were reverted (net diff empty). Files we do not know count as site files.
 */
export function markRelevant(commits, netFiles) {
  const netSite = netFiles ? new Set(netFiles.filter((f) => !CFG.noDeploy.test(f))) : null;
  return commits.map((c) => {
    const site = c.files.filter((f) => !CFG.noDeploy.test(f));
    const relevant = netSite ? site.some((f) => netSite.has(f)) : c.files.length === 0 || site.length > 0;
    return { ...c, relevant };
  });
}

// ---------------------------------------------------------------- status-board state (hidden JSON in the issue body)
const STATE_RE = /<!--state ([\s\S]*?) state-->/;
function loadState() {
  const empty = { v: 1, ticks: 0, events: [], deploys: [], blockedUntil: 0, lastWrite: 0, lastDecision: null };
  if (!ISSUE) return empty;
  try {
    const body = JSON.parse(gh(['api', `repos/${CFG.repo}/issues/${ISSUE}`])).body ?? '';
    const m = body.match(STATE_RE);
    return m ? { ...empty, ...JSON.parse(m[1]) } : empty;
  } catch (e) { log('could not read status issue:', String(e.message).slice(0, 160)); return empty; }
}
function event(st, kind, msg) {
  const last = st.events[0];
  if (last && last.kind === kind && last.msg === msg) return;
  st.events.unshift({ t: Date.now(), kind, msg });
  st.events = st.events.slice(0, 40);
}

// ---------------------------------------------------------------- the pipeline: open PRs and loose branches (everything upstream of main)
/** Pure. One open PR's place in the flow: 'draft' | 'conflicts' | 'red' | 'running' | 'behind' | 'ready' | 'unverified'. */
export function prStage(pr) {
  if (pr.draft) return 'draft';
  if (pr.mergeable === false || pr.mergeableState === 'dirty') return 'conflicts';
  if (pr.ci === 'fail') return 'red';
  if (pr.ci === 'pending') return 'running';
  if (pr.ci === 'none') return 'unverified';
  if (pr.mergeableState === 'behind') return 'behind'; // green, but main moved: update the branch and wait for CI again
  return 'ready'; // verify is green on its latest commit: mergeable now
}
const STAGE_LABEL = {
  ready: '✅ ready to merge',
  running: '⏳ CI running',
  red: '🔴 CI red',
  behind: '↻ behind main (update, re-run CI)',
  conflicts: '⚠️ merge conflicts',
  draft: '📝 draft',
  unverified: '❔ no CI yet',
};
const STAGE_ORDER = ['ready', 'behind', 'running', 'red', 'conflicts', 'unverified', 'draft'];

/** Pure. The "(#N)" a squash-merge title carries: which PR a commit on main came from. */
export const prOfSubject = (subject) => Number(/\(#(\d+)\)\s*$/.exec(subject ?? '')?.[1]) || null;

/** Pure. A short key that changes only when the pipeline's content does (ages excluded), so an idle board is not rewritten. */
export const pipelineDigest = (pl) => (pl ? [...pl.prs.map((p) => `${p.number}:${prStage(p)}`), '|', ...pl.branches.map((b) => `${b.name}:${b.ahead}`)].join(',') : '');

/** Pure. Markdown for the board. pl = { prs: [{number,title,branch,author,at,ci,draft,mergeable,mergeableState}], branches: [{name,ahead,at}], pendingMerged } */
export function renderPipeline(pl, now, repo = CFG.repo) {
  if (!pl) return ['', '### Pipeline', '_PR and branch data unavailable this tick (GitHub API failed); main-only view above is still correct._'];
  const lines = ['', '### Pipeline: branch → PR → main → live'];
  const counts = {};
  for (const p of pl.prs) counts[prStage(p)] = (counts[prStage(p)] ?? 0) + 1;
  const parts = STAGE_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${STAGE_LABEL[k].replace(/^\S+ /, '')}`);
  lines.push(`**${pl.prs.length} open PR${pl.prs.length === 1 ? '' : 's'}**${parts.length ? ` (${parts.join(' · ')})` : ''} → merged, waiting to deploy: **${pl.pendingMerged}** → live`);
  if (pl.prs.length) {
    lines.push('', '| PR | branch | state | CI `verify` | age |', '|---|---|---|---|---|');
    const sorted = [...pl.prs].sort((a, b) => STAGE_ORDER.indexOf(prStage(a)) - STAGE_ORDER.indexOf(prStage(b)) || a.at - b.at);
    for (const p of sorted) {
      const ci = { pass: 'green', fail: 'red', pending: 'running', none: 'none' }[p.ci] ?? p.ci;
      lines.push(`| [#${p.number}](https://github.com/${repo}/pull/${p.number}) ${String(p.title).replace(/\|/g, '/').slice(0, 70)} | \`${String(p.branch).slice(0, 40)}\` | ${STAGE_LABEL[prStage(p)]} | ${ci} | ${ago(now - p.at)} |`);
    }
  }
  if (pl.branches.length) {
    lines.push('', `**Branches with commits but no PR** (last ${CFG.branchRecentDays} days; not on the way to \`main\` yet):`);
    for (const b of pl.branches) lines.push(`- \`${b.name.slice(0, 50)}\` · ${b.ahead} commit${b.ahead === 1 ? '' : 's'} ahead of main · last push ${ago(now - b.at)} ago`);
  }
  if (!pl.prs.length && !pl.branches.length) lines.push('_Nothing in flight upstream of `main`._');
  return lines;
}

let pipelineCache = { at: 0, value: null };
/** IO. Open PRs (with their `verify` result and mergeability) and recent branches that have no PR. Never throws: null when GitHub fails. */
function pipelineSnapshot(pendingMerged) {
  if (Date.now() - pipelineCache.at < CFG.pipelineCacheSec * 1000 && pipelineCache.value) return { ...pipelineCache.value, pendingMerged };
  try {
    const api = (path) => JSON.parse(gh(['api', `repos/${CFG.repo}/${path}`]));
    const open = api('pulls?state=open&per_page=50&sort=created&direction=desc');
    const prs = open.slice(0, CFG.maxPrs).map((p) => {
      let ci = 'none';
      try { ci = ciVerdict(api(`commits/${p.head.sha}/check-runs?per_page=100`).check_runs, Date.now(), Date.parse(p.updated_at)); } catch { /* leave 'none' */ }
      let m = {};
      try { m = api(`pulls/${p.number}`); } catch { /* mergeability is a nicety */ }
      return { number: p.number, title: p.title, branch: p.head.ref, author: p.user?.login ?? '', at: Date.parse(p.created_at), ci, draft: !!p.draft, mergeable: m.mergeable ?? null, mergeableState: m.mergeable_state ?? null };
    });
    const withPr = new Set(open.map((p) => p.head.ref));
    const branches = [];
    const since = Date.now() - CFG.branchRecentDays * 24 * 3600e3;
    for (const b of api('branches?per_page=100')) {
      if (b.name === CFG.branch || withPr.has(b.name) || branches.length >= CFG.maxBranches) continue;
      try {
        const c = api(`compare/${CFG.branch}...${encodeURIComponent(b.name)}`);
        const at = Date.parse(c.commits?.[c.commits.length - 1]?.commit?.committer?.date ?? 0);
        if (c.ahead_by > 0 && at >= since) branches.push({ name: b.name, ahead: c.ahead_by, at });
      } catch { /* skip an unreadable branch */ }
    }
    branches.sort((a, b) => b.at - a.at);
    pipelineCache = { at: Date.now(), value: { prs, branches } };
    return { prs, branches, pendingMerged };
  } catch (e) { log('pipeline unavailable:', String(e.message).slice(0, 120)); return null; }
}

// ---------------------------------------------------------------- the decision
export function decide(ctx) {
  const { now, list, inflight, ready, pending, st } = ctx;
  const used = list.length;
  const spendable = CFG.dailyLimit - CFG.reserve - used;
  const free = CFG.dailyLimit - used;
  const createdAsc = list.map((d) => d.created).sort((a, b) => a - b);
  const slotFreeAt = (threshold) => (used <= threshold ? now : createdAsc[used - threshold - 1] + 24 * 3600e3);
  const base = { used, spendable, free, nextSlotAt: slotFreeAt(CFG.dailyLimit - 1) };

  if (inflight) return { ...base, action: 'hold', why: `build in progress (${inflight.sha?.slice(0, 7) ?? inflight.id})`, dueAt: null };
  if (!pending.relevant.length) return { ...base, action: 'idle', why: pending.commits.length ? 'nothing user-facing differs from what is live (docs, scripts, tests, CI or reverted edits only)' : 'main is live' };

  const head = pending.head;
  const failedHead = list.find((d) => d.sha === head && (d.state === 'ERROR' || d.state === 'CANCELED'));
  if (failedHead) return { ...base, action: 'blocked', why: `head ${head.slice(0, 7)} already failed (${failedHead.state}); waiting for a fixing commit`, dueAt: null };
  if (st.blockedUntil > now) return { ...base, action: 'blocked', why: 'Vercel said limit reached; backing off', dueAt: st.blockedUntil };

  const newest = Math.max(...pending.relevant.map((c) => c.at));
  const oldest = Math.min(...pending.relevant.map((c) => c.at));
  const quietFor = now - newest;
  const age = now - oldest;
  const urgent = pending.relevant.some((c) => c.urgent);
  const lastDep = list[0];
  const gapOk = !lastDep || now - lastDep.created >= CFG.minGapMin * 60e3;

  // The 24h count is only a pacing signal (Vercel's real limiter did not match a clean rolling count: it accepted
  // a deployment while we had ~150 in 24h). The hard stop is an actual 402 from Vercel, handled via st.blockedUntil.
  if (!gapOk) return { ...base, action: 'hold', why: 'previous deployment was seconds ago', dueAt: lastDep.created + CFG.minGapMin * 60e3 };
  if (urgent) return { ...base, action: 'deploy', why: `${CFG.urgentTag} commit`, newest, oldest };

  const tier = CFG.tiers.find((t) => spendable >= t.minSpendable) ?? CFG.tiers[CFG.tiers.length - 1]; // over budget => slowest pace
  const dueAt = Math.min(newest + tier.quietMin * 60e3, oldest + tier.maxWaitMin * 60e3);
  if (now >= dueAt) {
    const why = quietFor >= tier.quietMin * 60e3 ? `main quiet for ${ago(quietFor)} (>= ${tier.quietMin}m)` : `oldest pending is ${ago(age)} old (max wait ${tier.maxWaitMin}m)`;
    return { ...base, action: 'deploy', why, newest, oldest, tier };
  }
  return { ...base, action: 'hold', why: `waiting for a quiet moment (needs ${tier.quietMin}m quiet or ${tier.maxWaitMin}m max wait)`, dueAt, newest, oldest, tier };
}

// ---------------------------------------------------------------- who broke CI
/** Keep the CI status issue current and tell the owner once when main turns red / green again. Best effort: never blocks a deployment. */
function reportCi(st, head, headAt, liveSha = null) {
  if (DRY || !ISSUE) return;
  try {
    const v = ciState(head, headAt);
    if (v !== 'fail' && v !== 'pass') return;
    // A red commit that is already deployed (or building) is the worst case: say so, once per red head, even if the red alert went out earlier.
    if (v === 'fail' && liveSha && st.redLiveNoted !== head) {
      let inProd = false;
      try { execFileSync('git', ['merge-base', '--is-ancestor', head, liveSha], { stdio: 'ignore' }); inProd = true; } catch { /* not in the live/in-flight build */ }
      if (inProd) {
        st.redLiveNoted = head;
        gh(['api', '-X', 'POST', `repos/${CFG.repo}/issues/${CFG.ciIssue}/comments`, '--input', '-'], JSON.stringify({ body: `🚨 **The red commit is in production** (\`${head.slice(0, 7)}\` is live or building; its CI \`verify\` failed). Users may be hitting the bug now. The owner must fix it immediately; once CI is green, add \`[deploy-now]\` to the fix commit so it ships without batching.` }));
        event(st, 'ci', `RED COMMIT IS IN PRODUCTION: ${head.slice(0, 7)}`);
      }
    }
    if (st.ciReported === `${head}:${v}`) return;
    execFileSync('node', ['scripts/ci-status.mjs', '--issue', String(CFG.ciIssue)], { stdio: 'ignore' });
    st.ciReported = `${head}:${v}`;
    const wasRed = st.ciRed === true;
    if (v === 'fail' && !wasRed) {
      gh(['api', '-X', 'POST', `repos/${CFG.repo}/issues/${CFG.ciIssue}/comments`, '--input', '-'], JSON.stringify({ body: `🔴 **CI is red on main** (\`${head.slice(0, 7)}\`). Failing tests and the sessions most likely responsible are in the issue body above. The responsible session must fix it (CLAUDE.md, "CI is red").` }));
      event(st, 'ci', `main turned red at ${head.slice(0, 7)}: see issue #${CFG.ciIssue}`);
    }
    if (v === 'pass' && wasRed) {
      gh(['api', '-X', 'POST', `repos/${CFG.repo}/issues/${CFG.ciIssue}/comments`, '--input', '-'], JSON.stringify({ body: `🟢 CI is green on main again (\`${head.slice(0, 7)}\`).` }));
      event(st, 'ci', `main is green again at ${head.slice(0, 7)}`);
    }
    st.ciRed = v === 'fail';
  } catch (e) { log('ci report failed:', String(e.message).slice(0, 160)); }
}

// ---------------------------------------------------------------- the CI gate
/** Pure: what the check runs of one commit say. 'pass' | 'fail' | 'pending' | 'none' (no such check: CI never ran, do not block). */
export function ciVerdict(runs, now = Date.now(), headAt = null) {
  const mine = (runs ?? []).filter((r) => r.name === CFG.ciCheck).sort((a, b) => Date.parse(b.started_at ?? 0) - Date.parse(a.started_at ?? 0));
  // A commit pushed seconds ago has no check yet: that is "CI is about to start", not "CI never ran" (2026-11-09: f88ca27 was deployed
  // ungated in the gap before its verify run appeared).
  if (!mine.length) return headAt && now - headAt < CFG.ciStartGraceMin * 60e3 ? 'pending' : 'none';
  const r = mine[0];
  // A cancelled run was superseded (a newer push or a manual run in the same group), it says nothing about the code: wait for the next one.
  // But a cancelled run that finished a few minutes ago with nothing running after it is not coming back (2026-11-08: the head's
  // only verify run was cancelled and the gate held the deploy for 25 min): treat it as "CI never ran" rather than wait.
  if (r.status === 'completed' && r.conclusion === 'cancelled') {
    const done = Date.parse(r.completed_at ?? r.started_at ?? 0);
    return now - done > CFG.ciCancelledGraceMin * 60e3 ? 'none' : 'pending';
  }
  if (r.status !== 'completed') return 'pending';
  return ['success', 'neutral', 'skipped'].includes(r.conclusion) ? 'pass' : 'fail';
}

function ciState(sha, headAt = null) {
  try {
    const j = JSON.parse(gh(['api', `repos/${CFG.repo}/commits/${sha}/check-runs?per_page=100`]));
    return ciVerdict(j.check_runs, Date.now(), headAt);
  } catch (e) {
    log('CI status unavailable, not gating', String(e.message).slice(0, 120));
    return 'none';
  }
}

// ---------------------------------------------------------------- acting
function createDeployment(sha) {
  return vercel('POST', '/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1', {
    name: 'typecast',
    project: CFG.projectId,
    target: 'production',
    gitSource: { type: 'github', repoId: CFG.repoId, ref: CFG.branch, sha },
  });
}

async function watchBuild(id, st) {
  const deadline = Date.now() + CFG.pollMaxMin * 60e3;
  while (Date.now() < deadline) {
    await sleep(15e3);
    const r = vercel('GET', `/v13/deployments/${id}`);
    const s = r.json?.readyState;
    if (s === 'READY' || s === 'ERROR' || s === 'CANCELED') return { state: s, error: r.json?.errorMessage ?? r.json?.errorCode ?? null, readyAt: r.json?.ready ?? Date.now() };
  }
  return { state: 'BUILDING', error: null, readyAt: null };
}

// ---------------------------------------------------------------- the status board
function render(st, ctx, d, pending) {
  const { now, ready } = ctx;
  const live = ready?.sha ? `\`${ready.sha.slice(0, 7)}\` (deployed ${ago(now - ready.created)} ago)` : 'unknown';
  const rel = pending.relevant;
  const lines = [];
  lines.push('# Deploy Manager status board');
  lines.push('_Auto-updated by `scripts/deploy-manager.mjs` (GitHub Actions: after every CI run, PR or main, and every 5 min). Do not edit by hand._');
  lines.push('');
  const headline = { deploy: 'DEPLOYING', hold: 'HOLDING (batching pushes)', blocked: 'BLOCKED', idle: 'UP TO DATE' }[d.action] ?? d.action;
  lines.push(`**${headline}** — ${d.why}${d.dueAt && d.action !== 'idle' ? ` · due ${hhmm(d.dueAt)} UTC` : ''}`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| Live on production | ${live} |`);
  lines.push(`| Merged, needs a deploy | ${rel.length} commit${rel.length === 1 ? '' : 's'}${rel.length ? ` · oldest ${ago(now - Math.min(...rel.map((c) => c.at)))} ago` : ''} |`);
  lines.push(`| Deployments, last 24h | **${d.used}/${CFG.dailyLimit}** (${Math.max(d.spendable, 0)} spendable + ${CFG.reserve} reserve) |`);
  lines.push(`| Next free slot | ${d.free > 0 ? 'now' : `${hhmm(d.nextSlotAt)} UTC`} |`);
  lines.push(`| Last tick | ${iso(now)} (#${st.ticks}) |`);
  lines.push(...renderPipeline(ctx.pipeline, now));
  if (rel.length) {
    lines.push('', '### Merged to main, waiting to deploy');
    for (const c of rel.slice(0, 12)) lines.push(`- \`${c.sha.slice(0, 7)}\` ${c.subject.slice(0, 90)} · ${ago(now - c.at)} ago`);
    if (rel.length > 12) lines.push(`- … and ${rel.length - 12} more`);
  }
  if (st.deploys.length) {
    lines.push('', '### Recent deployments', '| when (UTC) | commit | batched | commit→live | result |', '|---|---|---|---|---|');
    for (const x of st.deploys.slice(0, 12)) {
      lines.push(`| ${iso(x.at).slice(5, 16).replace('T', ' ')} | \`${x.sha.slice(0, 7)}\` | ${x.n} | ${x.latencyMin != null ? `${x.latencyMin}m` : '…'} | ${x.state}${x.error ? ` — ${String(x.error).slice(0, 80)}` : ''} |`);
    }
    const done = st.deploys.filter((x) => x.state === 'READY' && x.latencyMin != null);
    if (done.length) {
      const lat = done.map((x) => x.latencyMin).sort((a, b) => a - b);
      const batched = done.reduce((s, x) => s + x.n, 0);
      lines.push('', `Stats (last ${done.length} ready deployments): median commit→live **${lat[Math.floor(lat.length / 2)]}m**, worst ${lat[lat.length - 1]}m, **${(batched / done.length).toFixed(1)} commits per deployment**.`);
    }
  }
  if (st.events.length) {
    lines.push('', '### Events');
    for (const e of st.events.slice(0, 15)) lines.push(`- ${iso(e.t).slice(5, 16).replace('T', ' ')} \`${e.kind}\` ${e.msg}`);
  }
  lines.push('', `<!--state ${JSON.stringify(st)} state-->`);
  return lines.join('\n');
}

function writeBoard(st, ctx, d, pending, force) {
  const md = render(st, ctx, d, pending);
  if (!ISSUE || DRY) { if (DRY) console.log(md.replace(STATE_RE, '')); return; }
  if (!force && ctx.now - st.lastWrite < 8 * 60e3 && JSON.stringify(st.lastDecision) === JSON.stringify([d.action, d.why, pipelineDigest(ctx.pipeline)])) return;
  st.lastWrite = ctx.now;
  st.lastDecision = [d.action, d.why, pipelineDigest(ctx.pipeline)];
  const md2 = render(st, ctx, d, pending);
  try { gh(['api', '-X', 'PATCH', `repos/${CFG.repo}/issues/${ISSUE}`, '--input', '-'], JSON.stringify({ body: md2 })); }
  catch (e) { log('could not write status issue:', String(e.message).slice(0, 160)); }
}

function alertFailure(text) {
  if (!ISSUE || DRY) return;
  try { gh(['api', '-X', 'POST', `repos/${CFG.repo}/issues/${ISSUE}/comments`, '--input', '-'], JSON.stringify({ body: `⚠️ **Deploy Manager (automated):** ${text}` })); }
  catch (e) { log('could not post alert:', String(e.message).slice(0, 160)); }
}

// ---------------------------------------------------------------- main
async function tick() {
  const st = loadState();
  st.ticks += 1;
  const started = Date.now();
  for (;;) {
    const now = Date.now();
    const list = deploymentsLast24h();
    const inflight = list.find((d) => ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(d.state) && d.target === 'production') ?? null;
    const ready = latestReadyProd(list);
    const base = inflight?.sha ?? ready?.sha ?? null;
    const pending = pendingCommits(base);
    const ctx = { now, list, inflight, ready, pending, st, pipeline: pipelineSnapshot(pending.relevant.length) };
    reportCi(st, pending.head, pending.commits[0]?.at ?? null, inflight?.sha ?? ready?.sha ?? null);
    const d = decide(ctx);
    log(`${d.action}: ${d.why} [used ${d.used}/${CFG.dailyLimit}, pending ${pending.relevant.length}]`);

    // Reflect finished builds into the ledger (an earlier run may have been cancelled while watching).
    for (const x of st.deploys) {
      if (x.state === 'BUILDING' || x.state === 'QUEUED') {
        const known = list.find((l) => l.id === x.id);
        if (known && known.state !== x.state && !['BUILDING', 'QUEUED', 'INITIALIZING'].includes(known.state)) {
          x.state = known.state;
          x.latencyMin = known.state === 'READY' ? Math.round((Date.now() - x.firstAt) / 60e3) : null;
          event(st, known.state === 'READY' ? 'ready' : 'failed', `${x.sha.slice(0, 7)} ${known.state}`);
        }
      }
    }

    if (d.action === 'deploy' && !DRY && !d.why.includes(CFG.urgentTag)) {
      const ci = ciState(pending.head, pending.commits[0]?.at ?? null);
      // Measured from the OLDEST pending commit (not the newest): a stream of pushes must not keep postponing the deploy (2026-11-11).
      const ageMin = (Date.now() - Math.min(...pending.relevant.map((c) => c.at))) / 60e3;
      // Red on the head only blocks when it is NEW: if the live commit was red too, CI has been red for a while and blocking would freeze
      // every release while changing nothing (2026-11-09: 4 smoke tests red since the previous evening). Deploy, and say so once.
      const chronic = ci === 'fail' && !!ctx.ready?.sha && ciState(ctx.ready.sha) === 'fail';
      if (chronic) {
        event(st, 'ci', `CI is red on the live commit ${ctx.ready.sha.slice(0, 7)} as well: not blocking ${pending.head.slice(0, 7)}`);
        if (st.redAlerted !== ctx.ready.sha) {
          st.redAlerted = ctx.ready.sha;
          alertFailure(`CI (\`${CFG.ciCheck}\`) has been red on \`main\` including the live commit, so it no longer gates deployments (a red head would otherwise freeze every release). The failing tests and the sessions most likely responsible are listed in issue #${CFG.ciIssue}; they must fix it. Once CI is green again the gate is automatic. A *new* failure after a green commit still blocks.`);
        }
      }
      if (ci === 'fail' && !chronic) {
        event(st, 'ci', `${pending.head.slice(0, 7)} failed CI after a green live commit: not deploying`);
        if (st.ciAlerted !== pending.head) {
          st.ciAlerted = pending.head;
          alertFailure(`CI (\`${CFG.ciCheck}\`) failed for \`${pending.head.slice(0, 7)}\` (the live commit was green), so it is **not deployed**. Production keeps the last good version. Fix main (a new commit re-runs the gate) or add \`${CFG.urgentTag}\` to a commit message to override.`);
        }
        writeBoard(st, ctx, { ...d, action: 'blocked', why: 'CI failed on the head commit' }, pending, true);
        return;
      }
      if (ci === 'pending' && ageMin < CFG.ciMaxWaitMin) {
        log(`CI still running for ${pending.head.slice(0, 7)}: holding`);
        writeBoard(st, ctx, { ...d, action: 'hold', why: 'waiting for CI to pass on the head commit' }, pending, false);
        // Keep this run alive and poll: GitHub's schedule is unreliable (2026-11-09: a 5.5h gap), so nothing else may be coming.
        if (WAIT && Date.now() - started < CFG.loopMaxMin * 60e3) { await sleep(CFG.sleepSec * 1000); continue; }
        return;
      }
      if (ci === 'pending') event(st, 'ci', `CI still running; oldest change is ${Math.round(ageMin)}m old: deploying ${pending.head.slice(0, 7)} anyway`);
    }
    if (d.action === 'deploy' && !DRY) {
      const sha = pending.head;
      const n = pending.relevant.length;
      const firstAt = Math.min(...pending.relevant.map((c) => c.at));
      event(st, 'deploy', `${sha.slice(0, 7)} — ${d.why}; batching ${n} commit${n === 1 ? '' : 's'}`);
      log(`DEPLOYING ${sha.slice(0, 7)} (${n} commit${n === 1 ? '' : 's'}): ${d.why}`); // the one line the deploy guard listens for: the decision alone (printed before the CI gate) is not a deployment
      const r = createDeployment(sha);
      if (r.status === 200 || r.status === 201) {
        const id = r.json.id ?? r.json.uid;
        const rec = { id, sha, n, firstAt, at: Date.now(), state: 'BUILDING', latencyMin: null, error: null };
        st.deploys.unshift(rec);
        st.deploys = st.deploys.slice(0, 60);
        writeBoard(st, ctx, { ...d, used: d.used + 1, spendable: d.spendable - 1, free: d.free - 1, action: 'deploy' }, pending, true);
        if (POLL) {
          const res = await watchBuild(id, st);
          rec.state = res.state;
          rec.error = res.error;
          if (res.state === 'READY') {
            rec.latencyMin = Math.round(((res.readyAt ?? Date.now()) - firstAt) / 60e3);
            event(st, 'ready', `${sha.slice(0, 7)} live after ${rec.latencyMin}m (${n} commit${n === 1 ? '' : 's'} in one deployment)`);
          } else if (res.state === 'ERROR' || res.state === 'CANCELED') {
            event(st, 'failed', `${sha.slice(0, 7)} ${res.state}: ${res.error ?? 'see Vercel'}`);
            alertFailure(`deployment of \`${sha.slice(0, 7)}\` ended ${res.state}${res.error ? ` (${res.error})` : ''}. It will not be retried until a new commit lands on main.`);
          }
        }
      } else if (r.status === 402 || r.json?.error?.code === 'payment_required') {
        st.blockedUntil = Date.now() + CFG.errorCooldownMin * 60e3;
        event(st, 'limit', `Vercel refused (${r.json?.error?.resource ?? '402'}); backing off ${CFG.errorCooldownMin}m (our 24h count: ${d.used})`);
        alertFailure(`Vercel rejected the deployment with its rate limit (my 24h count: ${d.used}). Backing off ${CFG.errorCooldownMin} min.`);
      } else {
        event(st, 'error', `deploy API ${r.status}: ${JSON.stringify(r.json)?.slice(0, 160)}`);
        alertFailure(`deploy API returned ${r.status}: ${JSON.stringify(r.json)?.slice(0, 300)}`);
      }
      const after = deploymentsLast24h();
      const d2 = decide({ now: Date.now(), list: after, inflight: after.find((x) => ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(x.state)) ?? null, ready: latestReadyProd(after), pending: pendingCommits(null && 0), st });
      writeBoard(st, { ...ctx, now: Date.now(), list: after, ready: latestReadyProd(after) }, d2, pendingCommits(latestReadyProd(after)?.sha ?? null), true);
      return;
    }

    if (d.action === 'blocked') event(st, 'blocked', d.why);
    if (d.action === 'hold' && WAIT && d.dueAt && d.dueAt - now > 0 && Date.now() - started + (d.dueAt - now) < CFG.loopMaxMin * 60e3) {
      writeBoard(st, ctx, d, pending, false);
      await sleep(Math.min(CFG.sleepSec * 1000, Math.max(d.dueAt - now, 1000)));
      continue;
    }
    writeBoard(st, ctx, d, pending, d.action === 'blocked' && st.events[0]?.kind === 'blocked' && st.events[0].t === Date.now());
    return;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  tick().catch((e) => { console.error(e); process.exit(1); });
}
