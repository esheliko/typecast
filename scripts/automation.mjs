#!/usr/bin/env node
// Writes the Automation board data (alerts, "what the manager used to do", statistics) into a GitHub issue that the deploy board reads.
//   node scripts/automation.mjs           gather, then create/update the issue labelled `automation-data`
//   node scripts/automation.mjs --dry     gather and print the summary, write nothing
// Runs in GitHub Actions (.github/workflows/automation.yml; GH_TOKEN, optional VERCEL_TOKEN / SUPABASE_ACCESS_TOKEN for the doctor checks).
// Every source is read fail-soft: an unreadable source becomes a `readErrors` entry (an alert), never a crash and never a wrong number.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { buildAutomation, deployStats, ciStats, prStats, processStats, parseAutomationBody, renderBody } from './automation-core.mjs';
import { parseStateBody, CFG } from './deploy-manager.mjs';
import { stuckPrs, findStuckCandidates } from './stale-red-prs.mjs';
import { parseChangelog, dueReviews } from './process-changelog.mjs';
import { plan as rulesPlan, FILES as RULE_FILES } from './build-rules.mjs';

const REPO = CFG.repo;
const LABEL = 'automation-data';
const gh = (path, ...extra) => JSON.parse(execFileSync('gh', ['api', ...extra, path], { encoding: 'utf8', maxBuffer: 64e6 }));
const curlStatus = (url, headers) => {
  const out = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '30', ...headers.flatMap((h) => ['-H', h]), url], { encoding: 'utf8' });
  return Number(out);
};

const readErrors = [];
const soft = (name, fn, fallback) => { try { return fn(); } catch (e) { readErrors.push(name); console.error(`read failed: ${name}: ${String(e.message).split('\n')[0]}`); return fallback; } };
const session = (msg) => msg?.match(/Claude-Session:\s*\S*?(session_\w+)/)?.[1];

function gather(now) {
  // 1. the deploy manager's own state (issue #1)
  const board = soft('deploy board state', () => parseStateBody(gh(`repos/${REPO}/issues/1`).body), { kind: 'bad' });
  const st = board.kind === 'ok' ? board.st : null;
  if (!st) readErrors.push('deploy board state');
  // 2. CI runs on main (pushes), newest first
  const runs = soft('ci runs', () => gh(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=60`).workflow_runs, []);
  const finished = runs.filter((r) => r.conclusion && r.conclusion !== 'cancelled');
  const newest = finished[0];
  const runInfo = (r) => ({ sha: r.head_sha, title: String(r.head_commit?.message ?? r.display_title).split('\n')[0], url: r.html_url, session: session(r.head_commit?.message) });
  const mainRed = newest && newest.conclusion === 'failure' ? runInfo(newest) : null;
  const liveSha = st?.deploys?.find((d) => d.state === 'READY')?.sha;
  const liveRun = liveSha ? finished.find((r) => r.head_sha === liveSha) : null;
  const redLive = liveRun && liveRun.conclusion === 'failure' ? runInfo(liveRun) : null;
  // 3. PRs
  const merged = soft('pull requests', () => gh(`repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100`).filter((p) => p.merged_at), []);
  const cands = soft('pull requests', () => findStuckCandidates(now), []);
  const stuck = stuckPrs(cands, new Set(), now);
  const openPrs = soft('pull requests', () => gh(`repos/${REPO}/pulls?state=open&per_page=50`).map((p) => ({ createdAt: p.created_at })), []);
  // 4. process
  const requests = soft('process requests', () => gh(`repos/${REPO}/issues?labels=process-request&state=open&per_page=50`).filter((i) => !i.pull_request).length, 0);
  const changelog = soft('process changelog', () => parseChangelog(readFileSync('process/CHANGELOG.md', 'utf8')), []);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(now));
  const due = dueReviews(changelog, today);
  const rules = soft('rules', () => {
    const doc = JSON.parse(readFileSync(RULE_FILES.rules, 'utf8'));
    const cur = Object.fromEntries(['claude', 'session', 'prompt'].map((k) => [k, existsSync(RULE_FILES[k]) ? readFileSync(RULE_FILES[k], 'utf8') : '']));
    const p = rulesPlan(doc, cur);
    return { count: doc.rules.length, tokens: p.tokens, budget: doc.budget.alwaysLoadedTokens };
  }, null);
  // 5. doctor: do the tokens still work? (unknown = not provided to this job, never a failure)
  const doctor = [];
  const check = (name, token, url, headers) => {
    if (!token) return doctor.push({ name, ok: null, detail: 'no token in this job' });
    try { const code = curlStatus(url, headers); doctor.push({ name, ok: code >= 200 && code < 300, detail: code >= 200 && code < 300 ? undefined : `HTTP ${code}` }); } catch (e) { doctor.push({ name, ok: null, detail: 'unreachable' }); }
  };
  check('Vercel token', process.env.VERCEL_TOKEN, `https://api.vercel.com/v6/deployments?projectId=${CFG.projectId}&teamId=${CFG.teamId}&limit=1`, [`Authorization: Bearer ${process.env.VERCEL_TOKEN}`]);
  check('Supabase access token', process.env.SUPABASE_ACCESS_TOKEN, 'https://api.supabase.com/v1/projects', [`Authorization: Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`]);
  return {
    alertInputs: {
      tickAgeMin: st?.lastWrite ? Math.round((now - st.lastWrite) / 60e3) : null,
      blockedUntil: st?.blockedUntil ?? 0, mainRed, redLive, stuck, doctor,
      reviewsDue: due.map((e) => `${e.pr} ${e.title}`), readErrors: [...new Set(readErrors)],
    },
    deploys: deployStats(st?.deploys ?? [], now),
    ci: ciStats(finished, now),
    prs: prStats(merged, openPrs, stuck, now),
    process: processStats({ requests, changelog, due, rules }),
  };
}

function findIssue() {
  const list = gh(`repos/${REPO}/issues?labels=${LABEL}&state=open&per_page=5`);
  return list.find((i) => !i.pull_request) ?? null;
}
const write = (method, path, body) => execFileSync('gh', ['api', '-X', method, path, '--input', '-'], { input: JSON.stringify(body), encoding: 'utf8' });

function main() {
  const dry = process.argv.includes('--dry');
  const now = Date.now();
  let issue = null;
  try { issue = findIssue(); } catch (e) { readErrors.push('automation issue'); }
  const prev = issue ? parseAutomationBody(issue.body)?.alerts : null;
  const parts = gather(now);
  const data = buildAutomation(parts, prev, now);
  const body = renderBody(data);
  if (dry) { console.log(body.split('<!--automation')[0]); console.log(`json bytes: ${JSON.stringify(data).length}`); return; }
  if (issue) write('PATCH', `repos/${REPO}/issues/${issue.number}`, { body });
  else write('POST', `repos/${REPO}/issues`, { title: 'Automation board data', body, labels: [LABEL] });
  console.log(`automation written: ${data.alerts.open.length} open alerts`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
