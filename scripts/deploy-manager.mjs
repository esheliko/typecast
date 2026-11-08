#!/usr/bin/env node
// Typecast Deploy Manager.
//
// Vercel's Hobby plan allows 100 deployments per rolling 24h. Git pushes no longer deploy by themselves
// (vercel.json: git.deploymentEnabled=false). This script is the only thing that deploys: it looks at what is
// pending on main, waits for a quiet moment so a burst of pushes becomes ONE deployment, and paces itself
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
    { minSpendable: 16, quietMin: 6, maxWaitMin: 25 },
    { minSpendable: 1, quietMin: 10, maxWaitMin: 60 },
  ],
  loopMaxMin: 14, // --wait: longest we sleep inside one run
  pollMaxMin: 9, // longest we watch a build
  sleepSec: 30,
  errorCooldownMin: 45, // after a 402 (limit) response
  // Commits that only touch these never need a deployment.
  noDeploy: /^(.*\.md|\.claude\/.*|\.github\/.*|artifact\.html|supabase\/.*|docs\/.*|scripts\/.*|tests\/.*|playwright\.config\.ts|\.gitignore|\.env\.example)$/,
  urgentTag: '[deploy-now]',
  // The CI gate: the head commit's `verify` check (.github/workflows/ci.yml) must have passed before it is deployed.
  ciCheck: 'verify',
  ciMaxWaitMin: 25, // CI still running this long after the newest commit => deploy anyway (a stuck CI must not freeze deployments)
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
  const commits = rows.map((r) => {
    const [sha, ct, subject] = r.split('\x1f');
    const files = git('show', '--name-only', '--format=', '--no-renames', sha).split('\n').filter(Boolean);
    const relevant = files.length === 0 || files.some((f) => !CFG.noDeploy.test(f));
    return { sha, at: Number(ct) * 1000, subject, relevant, urgent: subject.toLowerCase().includes(CFG.urgentTag) };
  });
  return { head, commits, relevant: commits.filter((c) => c.relevant) };
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
  if (!pending.relevant.length) return { ...base, action: 'idle', why: pending.commits.length ? 'only docs/config-neutral commits pending' : 'main is live' };

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

// ---------------------------------------------------------------- the CI gate
/** Pure: what the check runs of one commit say. 'pass' | 'fail' | 'pending' | 'none' (no such check: CI never ran, do not block). */
export function ciVerdict(runs) {
  const mine = (runs ?? []).filter((r) => r.name === CFG.ciCheck).sort((a, b) => Date.parse(b.started_at ?? 0) - Date.parse(a.started_at ?? 0));
  if (!mine.length) return 'none';
  const r = mine[0];
  // A cancelled run was superseded (a newer push or a manual run in the same group), it says nothing about the code: wait for the next one.
  if (r.status !== 'completed' || r.conclusion === 'cancelled') return 'pending';
  return ['success', 'neutral', 'skipped'].includes(r.conclusion) ? 'pass' : 'fail';
}

function ciState(sha) {
  try {
    const j = JSON.parse(gh(['api', `repos/${CFG.repo}/commits/${sha}/check-runs?per_page=100`]));
    return ciVerdict(j.check_runs);
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
  lines.push('_Auto-updated by `scripts/deploy-manager.mjs` (GitHub Actions every 5 min + on every push, with a Claude supervisor as backup). Do not edit by hand._');
  lines.push('');
  const headline = { deploy: 'DEPLOYING', hold: 'HOLDING (batching pushes)', blocked: 'BLOCKED', idle: 'UP TO DATE' }[d.action] ?? d.action;
  lines.push(`**${headline}** — ${d.why}${d.dueAt && d.action !== 'idle' ? ` · due ${hhmm(d.dueAt)} UTC` : ''}`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| Live on production | ${live} |`);
  lines.push(`| Pending (needs a deploy) | ${rel.length} commit${rel.length === 1 ? '' : 's'}${rel.length ? ` · oldest ${ago(now - Math.min(...rel.map((c) => c.at)))} ago` : ''} |`);
  lines.push(`| Deployments, last 24h | **${d.used}/${CFG.dailyLimit}** (${Math.max(d.spendable, 0)} spendable + ${CFG.reserve} reserve) |`);
  lines.push(`| Next free slot | ${d.free > 0 ? 'now' : `${hhmm(d.nextSlotAt)} UTC`} |`);
  lines.push(`| Last tick | ${iso(now)} (#${st.ticks}) |`);
  if (rel.length) {
    lines.push('', '### Pending commits');
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
  if (!force && ctx.now - st.lastWrite < 8 * 60e3 && JSON.stringify(st.lastDecision) === JSON.stringify([d.action, d.why])) return;
  st.lastWrite = ctx.now;
  st.lastDecision = [d.action, d.why];
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
    const ctx = { now, list, inflight, ready, pending, st };
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
      const ci = ciState(pending.head);
      const ageMin = (Date.now() - Math.max(...pending.relevant.map((c) => c.at))) / 60e3;
      if (ci === 'fail') {
        event(st, 'ci', `${pending.head.slice(0, 7)} failed CI: not deploying`);
        if (st.ciAlerted !== pending.head) {
          st.ciAlerted = pending.head;
          alertFailure(`CI (\`${CFG.ciCheck}\`) failed for \`${pending.head.slice(0, 7)}\`, so it is **not deployed**. Production keeps the last good version. Fix main (a new commit re-runs the gate) or add \`${CFG.urgentTag}\` to a commit message to override.`);
        }
        writeBoard(st, ctx, { ...d, action: 'blocked', why: 'CI failed on the head commit' }, pending, true);
        return;
      }
      if (ci === 'pending' && ageMin < CFG.ciMaxWaitMin) {
        log(`CI still running for ${pending.head.slice(0, 7)}: holding`);
        writeBoard(st, ctx, { ...d, action: 'hold', why: 'waiting for CI to pass on the head commit' }, pending, false);
        return;
      }
      if (ci === 'pending') event(st, 'ci', `CI still running after ${Math.round(ageMin)}m: deploying ${pending.head.slice(0, 7)} anyway`);
    }
    if (d.action === 'deploy' && !DRY) {
      const sha = pending.head;
      const n = pending.relevant.length;
      const firstAt = Math.min(...pending.relevant.map((c) => c.at));
      event(st, 'deploy', `${sha.slice(0, 7)} — ${d.why}; batching ${n} commit${n === 1 ? '' : 's'}`);
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
