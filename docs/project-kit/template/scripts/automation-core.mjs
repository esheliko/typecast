// Pure logic for the Automation board data (scripts/automation.mjs writes it into a GitHub issue; the deploy board reads it).
// No I/O here, so every rule is unit tested (tests/unit/automation.test.ts). Contract: AUTOMATION_VERSION, parsed back by parseAutomationBody.
export const AUTOMATION_VERSION = 1;
export const MARK = 'automation';
const RE = new RegExp(`<!--${MARK}\\s*([\\s\\S]*?)-->`);
export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const istDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));

// Deploy statistics from the deploy job's recorded deployments [{ sha, n, at, state, latencyMin }].
export function deployStats(deploys, now) {
  const list = (deploys ?? []).filter((d) => d && d.at);
  const within = (ms) => list.filter((d) => now - d.at <= ms);
  const d7 = within(7 * DAY);
  const lat = d7.filter((d) => d.state === 'READY' && Number.isFinite(d.latencyMin)).map((d) => d.latencyMin);
  const perDay = [];
  for (let i = 6; i >= 0; i--) { const day = istDay(now - i * DAY); perDay.push({ day, n: d7.filter((d) => istDay(d.at) === day).length }); }
  return {
    last24h: within(DAY).length,
    last7d: d7.length,
    commitsShipped7d: d7.reduce((n, d) => n + (d.n || 0), 0),
    medianCommitToLiveMin: median(lat),
    p90CommitToLiveMin: pct(lat, 90),
    failed7d: d7.filter((d) => d.state && d.state !== 'READY').length,
    perDay,
  };
}

// CI statistics from completed `verify` runs of pushes to main [{ conclusion, run_attempt, run_started_at, updated_at }].
export function ciStats(runs, now) {
  const done = (runs ?? []).filter((r) => r.conclusion && r.conclusion !== 'cancelled' && now - Date.parse(r.run_started_at ?? r.created_at) <= 7 * DAY);
  const mins = done.map((r) => Math.round((Date.parse(r.updated_at) - Date.parse(r.run_started_at)) / 60e3)).filter((m) => m >= 0);
  return {
    runs7d: done.length,
    red7d: done.filter((r) => r.conclusion === 'failure').length,
    greenAfterRerun7d: done.filter((r) => r.conclusion === 'success' && (r.run_attempt ?? 1) > 1).length,
    medianMin: median(mins),
  };
}

// PR statistics. merged = [{ created_at, merged_at }], open = [{ createdAt }], stuck = stuckPrs() output.
export function prStats(merged, open, stuck, now) {
  const m7 = (merged ?? []).filter((p) => p.merged_at && now - Date.parse(p.merged_at) <= 7 * DAY);
  const open2h = (open ?? []).filter((p) => now - Date.parse(p.createdAt) >= 2 * HOUR).length;
  return {
    merged7d: m7.length,
    medianOpenToMergeMin: median(m7.map((p) => Math.round((Date.parse(p.merged_at) - Date.parse(p.created_at)) / 60e3))),
    openNow: (open ?? []).length,
    openOver2h: open2h,
    stuckNow: (stuck ?? []).length,
  };
}

// Process statistics: requests (open issues), changelog entries (parseChangelog output), rules plan.
export function processStats({ requests, changelog, due, rules }) {
  return {
    openRequests: requests ?? 0,
    changesPending: (changelog ?? []).filter((e) => e.fields.Status === 'pending').length,
    changesConfirmed: (changelog ?? []).filter((e) => e.fields.Status === 'confirmed').length,
    changesMissed: (changelog ?? []).filter((e) => e.fields.Status === 'missed').length,
    reviewsDue: (due ?? []).map((e) => `${e.pr} ${e.title}`),
    rules: rules ?? null, // { count, tokens, budget }
  };
}

// Current problems. in = { now, tickAgeMin, blockedUntil, mainRed {sha,title,url,session}|null, redLive {sha,title}|null, stuck [], doctor [{name,ok,detail}], reviewsDue [], readErrors [] }.
// Each: { id, kind, severity: 'critical'|'warn'|'info', headline, link?, owner? }. id is stable while the condition lasts.
export function computeAlerts(i) {
  const a = [];
  if (i.redLive) a.push({ id: `red-live:${i.redLive.sha}`, kind: 'red-live', severity: 'critical', headline: `Production runs a red commit ${i.redLive.sha.slice(0, 7)} (${i.redLive.title})`, link: i.redLive.url, owner: i.redLive.session });
  if (i.mainRed) a.push({ id: `red-main:${i.mainRed.sha}`, kind: 'red-main', severity: i.redLive ? 'critical' : 'warn', headline: `main is red at ${i.mainRed.sha.slice(0, 7)} (${i.mainRed.title})`, link: i.mainRed.url, owner: i.mainRed.session });
  if (i.tickAgeMin != null && i.tickAgeMin > 20) a.push({ id: 'actions-stale', kind: 'actions-stale', severity: i.tickAgeMin > 60 ? 'critical' : 'warn', headline: `The deploy manager has not ticked for ${i.tickAgeMin} min (expected every 5 min)` });
  if (i.blockedUntil && i.blockedUntil > i.now) a.push({ id: 'deploy-blocked', kind: 'deploy-blocked', severity: 'warn', headline: `Deploys are paused until ${new Date(i.blockedUntil).toISOString().slice(11, 16)} UTC (Vercel backoff)` });
  for (const p of i.stuck ?? []) a.push({ id: `stuck-pr:${p.number}:${p.reasons.join('+')}`, kind: 'stuck-pr', severity: 'warn', headline: `PR #${p.number} is stuck (${p.reasons.join(', ')})`, link: `https://github.com/{{REPO}}/pull/${p.number}`, owner: p.session });
  for (const d of i.doctor ?? []) if (d.ok === false) a.push({ id: `doctor:${d.name}`, kind: 'doctor', severity: 'critical', headline: `Check failed: ${d.name}${d.detail ? ` (${d.detail})` : ''}` });
  for (const r of i.reviewsDue ?? []) a.push({ id: `review-due:${r}`, kind: 'review-due', severity: 'info', headline: `Process change ${r} is past its review date` });
  for (const e of i.readErrors ?? []) a.push({ id: `read:${e}`, kind: 'read-error', severity: 'warn', headline: `Automation could not read ${e}; its numbers may be stale` });
  return a;
}

// Lifecycle: keep firstSeen for a condition that continues, move cleared ones to `recent` (newest first, max 30).
export function mergeAlerts(prev, current, nowIso) {
  const prevOpen = new Map((prev?.open ?? []).map((a) => [a.id, a]));
  const open = current.map((a) => ({ ...a, firstSeen: prevOpen.get(a.id)?.firstSeen ?? nowIso, lastSeen: nowIso }));
  const ids = new Set(open.map((a) => a.id));
  const cleared = (prev?.open ?? []).filter((a) => !ids.has(a.id)).map((a) => ({ ...a, resolvedAt: nowIso }));
  const recent = [...cleared, ...(prev?.recent ?? [])].slice(0, 30);
  const order = { critical: 0, warn: 1, info: 2 };
  open.sort((x, y) => order[x.severity] - order[y.severity] || x.firstSeen.localeCompare(y.firstSeen));
  return { open, recent };
}

// What runs automatically, how, and whether it is healthy now. status: ok | warn | down | planned | manual. Describes only how things work now.
export function dutyList(h) {
  const tick = h.tickAgeMin == null ? 'warn' : h.tickAgeMin > 60 ? 'down' : h.tickAgeMin > 20 ? 'warn' : 'ok';
  const doctor = (h.doctor ?? []).length ? ((h.doctor ?? []).some((d) => d.ok === false) ? 'down' : (h.doctor ?? []).some((d) => d.ok == null) ? 'warn' : 'ok') : 'warn';
  const reads = (k) => (h.readErrors ?? []).includes(k) ? 'warn' : 'ok';
  return [
    { id: 'deploy', name: 'Deploy the head of main in batches', mechanism: 'GitHub Actions (every CI event + every 5 min)', status: tick, note: h.tickAgeMin == null ? 'last tick unknown' : `last tick ${h.tickAgeMin} min ago` },
    { id: 'live-notice', name: 'Show that a deploy went live', mechanism: 'Recent deployments on this board', status: 'ok', note: 'phone push: not set up yet' },
    { id: 'ci-red', name: 'Detect a red main and name its owner', mechanism: 'this job, plus the merging session\'s own CI check after every merge', status: reads('ci runs'), note: 'alert below when red' },
    { id: 'red-live', name: 'Flag a red commit that reached production', mechanism: 'this job (live sha vs its verify run)', status: reads('ci runs'), note: '' },
    { id: 'stuck-prs', name: 'Find PRs stuck without CI or in conflict', mechanism: 'this job (PRs older than 2 h)', status: reads('pull requests'), note: 'a comment on the PR itself: not built yet' },
    { id: 'stale-red', name: 'Tell PRs red only because of an old main', mechanism: 'not built yet', status: 'planned', note: '' },
    { id: 'flake-rerun', name: 'Re-run a red once and label flakes', mechanism: 'not built yet', status: 'planned', note: 'Statistics already count reds that went green on a re-run' },
    { id: 'tokens', name: 'Check that tokens and access still work', mechanism: 'checks of the Vercel and Supabase tokens in this job', status: doctor, note: (h.doctor ?? []).map((d) => `${d.name}: ${d.ok == null ? 'unknown' : d.ok ? 'ok' : 'FAILED'}`).join(', ') },
    { id: 'liveness', name: 'Show the automation itself is alive', mechanism: 'this board\'s "updated" time turns red when old', status: 'ok', note: '' },
    { id: 'requests', name: 'Receive process requests', mechanism: 'GitHub issues with label process-request', status: 'ok', note: `${h.openRequests ?? 0} open` },
    { id: 'review', name: 'Judge process changes by evidence', mechanism: 'process changelog review dates + this board', status: 'ok', note: `${(h.reviewsDue ?? []).length} due` },
    { id: 'resume', name: 'Resume sessions stopped by the usage limit', mechanism: 'on request, in a process session', status: 'manual', note: '' },
  ];
}

export const buildAutomation = (parts, prevAlerts, nowMs) => {
  const nowIso = new Date(nowMs).toISOString();
  const alerts = mergeAlerts(prevAlerts, computeAlerts({ ...parts.alertInputs, now: nowMs }), nowIso);
  return { v: AUTOMATION_VERSION, at: nowIso, alerts, duties: dutyList({ ...parts.alertInputs, openRequests: parts.process.openRequests }), stats: { deploys: parts.deploys, ci: parts.ci, prs: parts.prs, process: parts.process }, doctor: parts.alertInputs.doctor, readErrors: parts.alertInputs.readErrors };
};

// The issue body: readable summary + the machine block the board parses.
export function renderBody(data) {
  const L = ['# Automation board data', '_Written by `scripts/automation.mjs` (GitHub Actions). The deploy board reads the JSON block below; do not edit by hand._', ''];
  L.push(`Updated ${data.at}`, '', `**Open alerts: ${data.alerts.open.length}**`);
  for (const a of data.alerts.open) L.push(`- ${a.severity.toUpperCase()} · ${a.headline}${a.link ? ` · ${a.link}` : ''}`);
  L.push('', '| duty | now | status |', '|---|---|---|');
  for (const d of data.duties) L.push(`| ${d.name} | ${d.mechanism} | ${d.status} |`);
  const s = data.stats;
  L.push('', `Deploys 24h/7d: ${s.deploys.last24h}/${s.deploys.last7d}; median commit→live ${s.deploys.medianCommitToLiveMin ?? '?'} min; CI reds 7d ${s.ci.red7d}/${s.ci.runs7d}; PRs merged 7d ${s.prs.merged7d}.`, '', `<!--${MARK}`, JSON.stringify(data), '-->');
  return L.join('\n');
}

export function parseAutomationBody(body) {
  const m = typeof body === 'string' ? body.match(RE) : null;
  if (!m) return null;
  try { const d = JSON.parse(m[1]); return d && d.v === AUTOMATION_VERSION ? d : null; } catch { return null; }
}
