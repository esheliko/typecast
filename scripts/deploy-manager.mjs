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
  maxBranches: 60, // branches inspected (commits ahead of main); the old 7-day window is gone: age is shown instead so the owner decides
  maxBranchFiles: 40, // loose branch: files compared with main to tell whether its changes are already there
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
  return { head, commits, relevant: commits.filter((c) => c.relevant), netFiles: net, markers: recentMarkers(head) };
}

/**
 * Pure. The board's marker for one commit, from the files it touched, by the SAME noDeploy rule that decides whether a diff is user-facing:
 * 🔵 touches the site (app code/behaviour), ⚪ no production effect (docs, scripts, tests, CI, .claude, ...), ❓ unclear (no file list).
 * Never red: red reads as failure on the board.
 */
export function commitMarker(files, noDeploy = CFG.noDeploy) {
  if (!files?.length) return '❓';
  return files.some((f) => !noDeploy.test(f)) ? '🔵' : '⚪';
}
/** Pure. "1 production change, 11 no-effect" (+ ", 2 unclear"), from a list of markers. */
export function markerSummary(markers) {
  const n = (m) => markers.filter((x) => x === m).length;
  const parts = [];
  if (n('🔵')) parts.push(`${n('🔵')} production change${n('🔵') === 1 ? '' : 's'}`);
  if (n('⚪')) parts.push(`${n('⚪')} no-effect`);
  if (n('❓')) parts.push(`${n('❓')} unclear`);
  return parts.join(', ') || 'no commits';
}
const MARKER_COUNT = 40;
/** The last MARKER_COUNT commits on main with their marker, newest first, for the board's commit rows. */
function recentMarkers(head) {
  try {
    const out = git('log', `-${MARKER_COUNT}`, '--name-only', '--no-renames', '--format=%x1e%H', head);
    return out.split('\x1e').filter(Boolean).map((blk) => {
      const [sha, ...files] = blk.split('\n').map((l) => l.trim()).filter(Boolean);
      return { sha, marker: commitMarker(files) };
    });
  } catch (e) { log('markers failed', String(e.message).slice(0, 120)); return []; }
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
const EMPTY_STATE = () => ({ v: 1, ticks: 0, events: [], deploys: [], blockedUntil: 0, lastWrite: 0, lastDecision: null });
const BACKUP_RE = /<!--state-backup ([\s\S]*?) state-backup-->/;
const BACKUP_EVERY_MIN = 30;
const NO_DEPLOY = has('--no-deploy'); // hard guard: this run can never create a deployment (used for backfills)
const REBUILD = has('--rebuild-state'); // merge deployments rebuilt from Vercel + git into the state, then write the board

/**
 * Pure. What an issue body says about the state: {kind:'ok', st} | {kind:'missing'} (a real body without the marker) | {kind:'bad'} (empty body or marker that does not parse).
 * Only 'ok' and 'missing' are trustworthy answers; 'bad' means "we could not read it", never "there is no history".
 * 2026-11-13: a failed read was treated as an empty state and the next write replaced the whole body (454 ticks and ~60 deployments lost).
 */
export function parseStateBody(body) {
  if (typeof body !== 'string' || !body.trim()) return { kind: 'bad' };
  const m = body.match(STATE_RE);
  if (!m) return { kind: 'missing' };
  try {
    const st = JSON.parse(m[1]);
    if (!st || typeof st !== 'object' || !Array.isArray(st.deploys)) return { kind: 'bad' };
    return { kind: 'ok', st: { ...EMPTY_STATE(), ...st } };
  } catch { return { kind: 'bad' }; }
}

/** Pure. May the board be (re)written, given what the read said? Never after a failed read. */
export const mayWriteState = (read) => read?.kind === 'ok' || read?.kind === 'missing';

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function retry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) { if (i >= tries - 1) throw e; sleepSync(2000 * 2 ** i); }
  }
}

/** Raw read: {kind, st?, error?}. 'error' = the API call failed (after retries). */
function readState() {
  if (!ISSUE) return { kind: 'missing' };
  try {
    const body = retry(() => JSON.parse(gh(['api', `repos/${CFG.repo}/issues/${ISSUE}`])).body);
    return parseStateBody(body);
  } catch (e) { log('could not read status issue:', String(e.message).slice(0, 160)); return { kind: 'error' }; }
}

/** The latest good state, kept as a comment on the status issue (rolling: updated at most every BACKUP_EVERY_MIN). */
function readBackup(st) {
  try {
    const cs = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${CFG.repo}/issues/${ISSUE}/comments?per_page=100`])).flat();
    const c = [...cs].reverse().find((x) => BACKUP_RE.test(x.body ?? ''));
    if (!c) return null;
    const b = JSON.parse(c.body.match(BACKUP_RE)[1]);
    return b && Array.isArray(b.deploys) ? { ...b, backupId: c.id } : null;
  } catch (e) { log('could not read backup:', String(e.message).slice(0, 120)); return null; }
}
function writeBackup(st, now) {
  if (!ISSUE || DRY || now - (st.backupAt ?? 0) < BACKUP_EVERY_MIN * 60e3) return;
  const copy = { ...st, backupAt: now };
  const body = `State backup (automated, rolling; the status board restores from this if its own state is ever lost. Do not edit.)\n\n<!--state-backup ${JSON.stringify(copy)} state-backup-->`;
  try {
    if (st.backupId) gh(['api', '-X', 'PATCH', `repos/${CFG.repo}/issues/comments/${st.backupId}`, '--input', '-'], JSON.stringify({ body }));
    else st.backupId = JSON.parse(gh(['api', '-X', 'POST', `repos/${CFG.repo}/issues/${ISSUE}/comments`, '--input', '-'], JSON.stringify({ body }))).id;
    st.backupAt = now;
  } catch (e) { log('could not write backup:', String(e.message).slice(0, 120)); }
}

/**
 * Pure. Deployment records from Vercel's production list (source of truth for sha, time, state) plus a git lookup for the mix.
 * list: [{id, state, target, created, ready, sha}], any order. commitsBetween(prevSha, sha) -> [{at, files}] (newest first) or null.
 * Returns newest first, at most `max`.
 */
export function rebuildDeploys(list, commitsBetween, max = 60, noDeploy = CFG.noDeploy) {
  const prod = list.filter((d) => d.target === 'production' && d.sha && ['READY', 'ERROR', 'CANCELED', 'BUILDING', 'QUEUED'].includes(d.state)).sort((a, b) => a.created - b.created).slice(-max - 1);
  const out = [];
  prod.forEach((d, i) => {
    if (i === 0 && prod.length > max) return; // only there as the base of the next one
    const commits = commitsBetween(prod[i - 1]?.sha ?? null, d.sha) ?? [];
    const rel = commits.filter((c) => !c.files?.length || c.files.some((f) => !noDeploy.test(f)));
    const firstAt = rel.length ? Math.min(...rel.map((c) => c.at)) : commits.length ? Math.min(...commits.map((c) => c.at)) : d.created;
    out.push({
      id: d.id, sha: d.sha, n: Math.max(rel.length, 1), mix: markerSummary(commits.map((c) => commitMarker(c.files, noDeploy))), firstAt, at: d.created, state: d.state,
      latencyMin: d.state === 'READY' ? Math.max(0, Math.round(((d.ready ?? d.created) - firstAt) / 60e3)) : null, error: null, rebuilt: true,
    });
  });
  return out.reverse();
}
/** Pure. Existing records win; rebuilt ones fill in (by deployment id); newest first, at most max. */
export const mergeDeploys = (existing, rebuilt, max = 60) => {
  const seen = new Set((existing ?? []).map((x) => x.id));
  return [...(existing ?? []), ...rebuilt.filter((x) => !seen.has(x.id))].sort((a, b) => b.at - a.at).slice(0, max);
};

function rebuildFromVercel() {
  const r = vercel('GET', `/v6/deployments?projectId=${CFG.projectId}&target=production&limit=100`);
  if (r.status !== 200) throw new Error(`list deployments failed: ${r.status}`);
  const list = r.json.deployments.map((d) => ({ id: d.uid, state: d.readyState ?? d.state, target: d.target ?? 'production', created: d.created, ready: d.ready ?? null, sha: d.meta?.githubCommitSha ?? null }));
  const commitsBetween = (prev, sha) => {
    try {
      let base = prev && gitOk('cat-file', '-e', `${prev}^{commit}`) && gitOk('merge-base', '--is-ancestor', prev, sha) ? prev : null;
      if (!gitOk('cat-file', '-e', `${sha}^{commit}`)) return null;
      const rows = git('log', ...(base ? [`${base}..${sha}`] : ['-1', sha]), '--format=%x1e%ct', '--name-only', '--no-renames').split('\x1e').filter(Boolean);
      return rows.map((blk) => { const [ct, ...files] = blk.split('\n').map((l) => l.trim()).filter(Boolean); return { at: Number(ct) * 1000, files }; });
    } catch { return null; }
  };
  return rebuildDeploys(list, commitsBetween);
}

/** {st, read} — st is only to be written back when mayWriteState(read). */
function loadState() {
  const read = readState();
  if (read.kind === 'ok') return { st: read.st, read };
  const st = EMPTY_STATE();
  if (read.kind === 'missing' && ISSUE) {
    const b = readBackup();
    if (b) { Object.assign(st, b); st.events = [{ t: Date.now(), kind: 'restore', msg: 'state was missing from the issue body; restored from the backup comment' }, ...(st.events ?? [])]; return { st, read }; }
    try { st.deploys = rebuildFromVercel(); st.events = [{ t: Date.now(), kind: 'restore', msg: `state was missing and no backup found; rebuilt ${st.deploys.length} deployments from Vercel + git` }]; }
    catch (e) { log('rebuild failed:', String(e.message).slice(0, 160)); }
  }
  return { st, read };
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
export const pipelineDigest = (pl) => (pl ? [pl.prs ? 'p' : 'P?', pl.branches ? 'b' : 'B?', ...(pl.prs ?? []).map((p) => `${p.number}:${prStage(p)}:${commitMarker(p.files)}`), '|', ...(pl.branches ?? []).map((b) => `${b.name}:${b.ahead}:${b.inMain}`), '|', pl.mergedLeft ?? 0, pl.inMainLeft ?? 0].join(',') : '');

/**
 * Pure. Where does a branch stand?  'open' (has an open PR: shown in the PR table), 'merged' (a PR of any other state exists: this repo SQUASH-merges,
 * so the branch stays "ahead of main" for good, it is leftover, not work), 'loose' (no PR of any state). prState: map branch -> Set of PR states.
 */
export function branchKind(name, prStates) {
  const st = prStates.get(name);
  if (!st?.size) return 'loose';
  return st.has('open') ? 'open' : 'merged';
}
/** Pure. PRs (any state) that contain a branch's tip commit (GET commits/<sha>/pulls): a merged or open one means the work went through a PR under another branch name. */
export const tipCoveredByPr = (prs) => (prs ?? []).some((p) => p.merged_at || p.state === 'open');
/**
 * Pure. Is a loose branch's work already in main?  files = compare files [{filename,status,sha}] (sha = blob at the branch head),
 * mainShas = Map filename -> blob sha on main (missing = absent there). 'yes' | 'no' | 'partly'. An empty diff counts as yes.
 */
export function inMainState(files, mainShas) {
  if (!files.length) return 'yes';
  const same = files.filter((f) => (f.status === 'removed' ? !mainShas.get(f.filename) : mainShas.get(f.filename) === f.sha)).length;
  return same === files.length ? 'yes' : same === 0 ? 'no' : 'partly';
}

/** Pure. Markdown for the board. pl = { prs: [{number,title,branch,author,at,ci,draft,mergeable,mergeableState,files}], branches: [{name,ahead,at,files,inMain}] (loose only), mergedLeft, inMainLeft, pendingMerged } */
export function renderPipeline(pl, now, repo = CFG.repo) {
  if (!pl) return ['', '### Pipeline', '_PR and branch data unavailable this tick (GitHub API failed); main-only view above is still correct._'];
  const lines = ['', '### Pipeline: branch → PR → main → live'];
  const counts = {};
  const prs = pl.prs ?? [];
  const branches = pl.branches ?? [];
  for (const p of prs) counts[prStage(p)] = (counts[prStage(p)] ?? 0) + 1;
  const parts = STAGE_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${STAGE_LABEL[k].replace(/^\S+ /, '')}`);
  if (pl.prs) lines.push(`**${prs.length} open PR${prs.length === 1 ? '' : 's'}**${parts.length ? ` (${parts.join(' · ')})` : ''} → merged, waiting to deploy: **${pl.pendingMerged}** → live`);
  else lines.push(`_Open PRs unavailable this tick (GitHub API failed)._ Merged, waiting to deploy: ${pl.pendingMerged}`);
  if (prs.length) {
    lines.push('', '| PR | change | branch | state | CI `verify` | age |', '|---|---|---|---|---|---|');
    const sorted = [...prs].sort((a, b) => STAGE_ORDER.indexOf(prStage(a)) - STAGE_ORDER.indexOf(prStage(b)) || a.at - b.at);
    for (const p of sorted) {
      const ci = { pass: 'green', fail: 'red', pending: 'running', none: 'none' }[p.ci] ?? p.ci;
      lines.push(`| [#${p.number}](https://github.com/${repo}/pull/${p.number}) ${String(p.title).replace(/\|/g, '/').slice(0, 70)} | ${commitMarker(p.files)} | \`${String(p.branch).slice(0, 40)}\` | ${STAGE_LABEL[prStage(p)]} | ${ci} | ${ago(now - p.at)} |`);
    }
  }
  if (!pl.branches) lines.push('', '_Branch data unavailable this tick (GitHub API failed)._');
  if (branches.length) {
    lines.push('', '**Loose branches** (commits ahead of `main`, no PR of any state, changes not already in `main`; the owner decides: delete, keep or open a PR):');
    for (const b of branches) lines.push(`- \`${b.name.slice(0, 50)}\` · ${b.ahead} commit${b.ahead === 1 ? '' : 's'} ahead of main · ${b.files} file${b.files === 1 ? '' : 's'} · already in main: ${b.inMain} · last push ${ago(now - b.at)} ago`);
  }
  const left = [];
  if (pl.mergedLeft) left.push(`- ${pl.mergedLeft} merged branch${pl.mergedLeft === 1 ? '' : 'es'} not deleted (squash-merge leaves them "ahead of main"; leftovers, not work)`);
  if (pl.inMainLeft) left.push(`- ${pl.inMainLeft} branch${pl.inMainLeft === 1 ? '' : 'es'} with no PR whose changes are already in main (safe to delete)`);
  if (left.length) lines.push('', ...left);
  if (pl.prs && pl.branches && !prs.length && !branches.length) lines.push('_Nothing in flight upstream of `main`._');
  return lines;
}

let pipelineCache = { at: 0, value: null };
const notFound = (e) => /HTTP 404|Not Found/i.test(`${e?.message ?? ''} ${e?.stderr ?? ''}`);
/**
 * IO. The pipeline in two independent parts: `prs` (open PRs with `verify` result, mergeability, files) and the branch split
 * (`branches`, `mergedLeft`, `inMainLeft`). A part that fails (GitHub 5xx, rate limit) keeps its last good value, or is null
 * (rendered as "unavailable") when there never was one: one failing call must not blank the other part. Never throws.
 */
function pipelineSnapshot(pendingMerged) {
  if (Date.now() - pipelineCache.at < CFG.pipelineCacheSec * 1000 && pipelineCache.value) return { ...pipelineCache.value, pendingMerged };
  const api = (path) => JSON.parse(gh(['api', `repos/${CFG.repo}/${path}`]));
  const apiOrNull = (path) => { try { return api(path); } catch (e) { if (notFound(e)) return null; throw e; } }; // 404 = absent; anything else (5xx, rate limit) must NOT read as "absent"
  const last = pipelineCache.value ?? {};
  const part = (name, fn, keep) => {
    try { return { ...fn(), failed: false }; } catch (e) {
      log(`pipeline ${name} unavailable:`, String(e.message).slice(0, 120));
      return { ...keep, failed: true };
    }
  };
  const prsPart = part('prs', () => {
    const open = api('pulls?state=open&per_page=50&sort=created&direction=desc');
    const prs = open.slice(0, CFG.maxPrs).map((p) => {
      let ci = 'none';
      try { ci = ciVerdict(api(`commits/${p.head.sha}/check-runs?per_page=100`).check_runs, Date.now(), Date.parse(p.updated_at)); } catch { /* leave 'none' */ }
      let m = {};
      try { m = api(`pulls/${p.number}`); } catch { /* mergeability is a nicety */ }
      let files = [];
      try { files = api(`pulls/${p.number}/files?per_page=100`).map((f) => f.filename); } catch { /* marker becomes ❓ */ }
      return { number: p.number, title: p.title, branch: p.head.ref, author: p.user?.login ?? '', at: Date.parse(p.created_at), ci, draft: !!p.draft, mergeable: m.mergeable ?? null, mergeableState: m.mergeable_state ?? null, files };
    });
    return { prs };
  }, { prs: last.prs ?? null });
  const brPart = part('branches', () => {
    // PRs of ANY state (merged and closed too), by head branch: a branch with a PR in any state is never "loose".
    const prStates = new Map();
    for (const p of api('pulls?state=all&per_page=100')) {
      if (p.head?.repo?.full_name !== CFG.repo) continue;
      if (!prStates.has(p.head.ref)) prStates.set(p.head.ref, new Set());
      prStates.get(p.head.ref).add(p.state);
    }
    const branches = [];
    let mergedLeft = 0, inMainLeft = 0, seen = 0;
    for (const b of api('branches?per_page=100')) {
      if (b.name === CFG.branch || seen >= CFG.maxBranches) continue;
      const kind = branchKind(b.name, prStates);
      if (kind === 'open') continue;
      seen++;
      const c = api(`compare/${CFG.branch}...${encodeURIComponent(b.name)}`); // any failure fails the whole part: a skipped branch would silently change the counts
      if (!(c.ahead_by > 0)) continue;
      if (kind === 'merged') { mergedLeft++; continue; }
      // A stacked branch whose tip commit was merged through another branch's PR (e.g. wip/step5b-polish inside wip/qa-integration-2) is a leftover too.
      if (tipCoveredByPr(api(`commits/${b.commit.sha}/pulls`))) { mergedLeft++; continue; }
      const at = Date.parse(c.commits?.[c.commits.length - 1]?.commit?.committer?.date ?? 0);
      const files = (c.files ?? []).slice(0, CFG.maxBranchFiles);
      const mainShas = new Map();
      for (const f of files) {
        const onMain = apiOrNull(`contents/${f.filename.split('/').map(encodeURIComponent).join('/')}?ref=${CFG.branch}`);
        if (onMain) mainShas.set(f.filename, f.status === 'removed' ? 'present' : onMain.sha);
      }
      const inMain = inMainState(files, mainShas);
      if (inMain === 'yes') { inMainLeft++; continue; }
      branches.push({ name: b.name, ahead: c.ahead_by, at, files: c.files?.length ?? files.length, inMain });
    }
    branches.sort((a, b) => a.at - b.at);
    return { branches, mergedLeft, inMainLeft };
  }, { branches: last.branches ?? null, mergedLeft: last.mergedLeft ?? 0, inMainLeft: last.inMainLeft ?? 0 });
  const { failed: prsFailed, ...prsOnly } = prsPart;
  const { failed: brFailed, ...brOnly } = brPart;
  const value = { ...prsOnly, ...brOnly };
  if (prsFailed && brFailed && !last.prs && !last.branches) return null; // nothing at all: the whole section says "unavailable"
  // A fully good snapshot is cached; a partly failed one is retried next tick instead of being pinned for 2 minutes.
  if (!prsFailed && !brFailed) pipelineCache = { at: Date.now(), value };
  else pipelineCache = { at: 0, value };
  return { ...value, pendingMerged };
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
  if (NO_DEPLOY || DRY) throw new Error('createDeployment called in a no-deploy run');
  return vercel('POST', '/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1', {
    name: 'typecast',
    project: CFG.projectId,
    target: 'production',
    gitSource: { type: 'github', repoId: CFG.repoId, ref: CFG.branch, sha },
  });
}

/**
 * Apply pending database migrations (scripts/migrate.mjs) before a deployment. Returns null when fine, else the text to alert with: a failed migration blocks the deploy.
 * Without SUPABASE_ACCESS_TOKEN the step is skipped unless the batch touches supabase/migrations (then it blocks and says what is missing).
 */
function migrateBeforeDeploy(touchesMigrations) {
  if (!process.env.SUPABASE_ACCESS_TOKEN && !process.env.HTTPS_PROXY) {
    return touchesMigrations ? 'this batch changes `supabase/migrations/` but the repo secret `SUPABASE_ACCESS_TOKEN` is missing, so the migration cannot be applied. Add it (Supabase account access token) and the next tick deploys.' : null;
  }
  try {
    const out = execFileSync('node', ['scripts/migrate.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8e6, env: process.env });
    log(out.trim().split('\n').slice(-3).join(' | '));
    return null;
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n');
    if (e.status === 2 && !touchesMigrations) { log('migrations skipped (cannot run here):', out.slice(0, 200)); return null; }
    return `a database migration failed or could not run, so the deploy is **blocked** (production keeps the last version). Output:\n\`\`\`\n${out.slice(0, 1200)}\n\`\`\`\nFix the migration file (new PR) or run \`node scripts/migrate.mjs\` after fixing the database; the next tick retries.`;
  }
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
/** Marker section of the status issue; the board artifact reads `- `sha7` 🔵` lines under this heading. Format changes need the artifact's `markers` calc updated. */
export function renderMarkers(markers) {
  if (!markers?.length) return [];
  return ['', `### Commit markers (last ${markers.length} on main)`, '🔵 affects production · ⚪ no production effect · ❓ unclear', ...markers.map((m) => `- \`${m.sha.slice(0, 7)}\` ${m.marker}`)];
}

/**
 * THE BOARD CONTRACT. The deploy board artifact (DEPLOYING.md > Visual board) parses the text of issue #1 with these exact patterns
 * (copied from its `mgr`, `pipeline*`, `markers`, `recent_live` calcs). tests/unit/deploy-board-format.test.ts runs them against `render`.
 * If you must change the text, update the artifact in the same task (ArtifactData on its files/index.html) AND this constant, and say so in the PR.
 */
export const BOARD_CONTRACT = {
  headline: /\*\*(.+?)\*\* — (.*)/,
  pendingCommit: /^- `([0-9a-f]{7})` (.*) · \S+ ago$/gm,
  pipelineSummary: /\*\*(\d+) open PRs?\*\*(?: \((.*?)\))? → merged, waiting to deploy: \*\*(\d+)\*\*/,
  // cells: #, title, marker, branch, state, CI, age
  pipelinePr: /^\| \[#(\d+)\]\([^)]*\) (.*?) \| (🔵|⚪|❓) \| `([^`]*)` \| (.*?) \| (\w+) \| (.*?) \|$/gmu,
  // loose branches only: name, commits, files, already-in-main (no|partly), age
  pipelineBranch: /^- `([^`]+)` · (\d+) commits? ahead of main · (\d+) files? · already in main: (no|partly) · last push (.+?) ago$/gm,
  // merged-PR leftovers and no-PR-but-already-in-main counts (each line optional)
  pipelineMergedLeft: /^- (\d+) merged branch(?:es)? not deleted/m,
  pipelineInMainLeft: /^- (\d+) branch(?:es)? with no PR whose changes are already in main/m,
  marker: /^- `([0-9a-f]{7})` (🔵|⚪|❓)$/gmu,
  state: /<!--state ([\s\S]*?) state-->/,
  // state JSON: deploys[] {at, sha, n, latencyMin, state, mix}, events[] {t, kind, msg}, lastWrite
};

export function render(st, ctx, d, pending) {
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
  lines.push(...renderMarkers(pending.markers));
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
  if (!force && !REBUILD && ctx.now - st.lastWrite < 8 * 60e3 && JSON.stringify(st.lastDecision) === JSON.stringify([d.action, d.why, pipelineDigest(ctx.pipeline)])) return;
  st.lastWrite = ctx.now;
  st.lastDecision = [d.action, d.why, pipelineDigest(ctx.pipeline)];
  writeBackup(st, ctx.now);
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
  const { st, read } = loadState();
  if (!mayWriteState(read)) {
    // Could not read the board's state (GitHub 5xx, empty or corrupt body): writing now would replace real history with a blank one. Skip; the next tick tries again.
    log(`SKIPPED: status-issue state unreadable (${read.kind}); nothing written, nothing deployed this tick`);
    return;
  }
  if (REBUILD) { try { st.deploys = mergeDeploys(st.deploys, rebuildFromVercel()); log(`rebuilt: ${st.deploys.length} deployments in state`); } catch (e) { log('rebuild failed, aborting:', String(e.message).slice(0, 160)); return; } }
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

    if (d.action === 'deploy' && !DRY && !NO_DEPLOY && !d.why.includes(CFG.urgentTag)) {
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
    if (d.action === 'deploy' && !DRY && !NO_DEPLOY) {
      const sha = pending.head;
      const n = pending.relevant.length;
      const firstAt = Math.min(...pending.relevant.map((c) => c.at));
      event(st, 'deploy', `${sha.slice(0, 7)} — ${d.why}; batching ${n} commit${n === 1 ? '' : 's'}`);
      log(`DEPLOYING ${sha.slice(0, 7)} (${n} commit${n === 1 ? '' : 's'}): ${d.why}`); // the one line the deploy guard listens for: the decision alone (printed before the CI gate) is not a deployment
      const mig = migrateBeforeDeploy(pending.commits.some((c) => (c.files ?? []).some((f) => f.startsWith('supabase/migrations/'))));
      if (mig) {
        event(st, 'migration', `migration blocked the deploy of ${sha.slice(0, 7)}`);
        if (st.migAlertSha !== sha) { st.migAlertSha = sha; alertFailure(`${mig} (issue #${CFG.ciIssue} tracks CI; this blocks only the deploy)`); }
        writeBoard(st, ctx, d, pending, true);
        return;
      }
      const r = createDeployment(sha);
      if (r.status === 200 || r.status === 201) {
        const id = r.json.id ?? r.json.uid;
        const rec = { id, sha, n, mix: markerSummary(pending.commits.map((c) => commitMarker(c.files))), firstAt, at: Date.now(), state: 'BUILDING', latencyMin: null, error: null };
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
