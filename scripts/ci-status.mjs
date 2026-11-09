#!/usr/bin/env node
// CI verdict for main + who is responsible when it is red.
//
//   node scripts/ci-status.mjs [--wait] [--sha SHA] [--issue N]
//
//   (default)  print the verdict of the `verify` check on origin/main's head (or --sha): pass | fail | pending | none.
//              On fail it names the failing tests and the suspect commits/sessions since the last green commit.
//   --for SHA  (with --wait) wait for the first FINISHED verdict on SHA or any later main commit: the verdict that covers your push. This is what a
//              session runs in the background after pushing; it ends with a line telling the session whether it is the Owner.
//   --wait     poll until the head has a finished (not cancelled) verdict, following main if it moves; give up after 20 min.
//              Sessions run this after pushing (CLAUDE.md): exit code 1 = red, 0 = green/none, 2 = still running.
//   --issue N  also write the result into GitHub issue N (the "CI status" board the Deploy Manager keeps).
//
// Responsibility comes from the `Claude-Session:` trailer every session puts on its commits.
import { execFileSync } from 'node:child_process';

const REPO = 'esheliko/typecast';
const CHECK = 'verify';
const argv = process.argv.slice(2);
const WAIT = argv.includes('--wait');
const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const ISSUE = arg('--issue');
const FOR = arg('--for');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64e6 }).trim();
const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64e6 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pure: failing test titles out of the annotation text Playwright's list reporter leaves on the check run. */
export function parseFailures(texts) {
  const out = new Set();
  for (const t of texts) {
    for (const m of String(t).matchAll(/^\s+(tests\/[^\s:]+\.spec\.ts):(\d+):\d+ › (.+?)\s*$/gm)) out.add(`${m[1]} › ${m[3].replace(/[\s─]+$/, '')}`);
  }
  return [...out];
}

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) ?? []);
const STOP = new Set(['tests', 'smoke', 'spec', 'signed', 'behaviour', 'that', 'this', 'with', 'from', 'then', 'when', 'under', 'page', 'title']);

/** Pure: rank commits by how well they match the failing tests (shared words with the test title, test file touched, test words in changed paths). */
export function rankSuspects(failures, commits) {
  const tw = new Set();
  for (const f of failures) for (const w of words(f)) if (!STOP.has(w)) tw.add(w);
  return commits
    .map((c) => {
      let score = 0;
      for (const w of words(c.subject)) if (tw.has(w)) score += 2;
      for (const f of c.files) {
        if (failures.some((x) => x.startsWith(f))) score += 4;
        for (const w of words(f)) if (tw.has(w)) score += 1;
      }
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Pure. Exactly one session owns a red main, so nobody can assume it is someone else's: the best-scoring suspect, else the session of the EARLIEST
 * commit since the last green one (the first change after green is the likeliest cause, and a deterministic tie-break stops two sessions each
 * blaming the other). `commits` are newest first (git log order).
 */
export function pickOwner(ranked, commits) {
  const top = ranked.find((c) => c.score > 0 && c.session);
  if (top) return { session: top.session, why: `best match with the failing tests (\`${top.sha.slice(0, 7)}\`)` };
  const earliest = [...commits].reverse().find((c) => c.session);
  if (earliest) return { session: earliest.session, why: `no commit matches the failing tests, so the first push after the last green commit (\`${earliest.sha.slice(0, 7)}\`) owns it` };
  return null;
}

function checkOf(sha) {
  const runs = gh(`repos/${REPO}/commits/${sha}/check-runs?per_page=100`).check_runs.filter((r) => r.name === CHECK);
  runs.sort((a, b) => Date.parse(b.started_at ?? 0) - Date.parse(a.started_at ?? 0));
  return runs[0] ?? null;
}
function verdict(run) {
  if (!run) return 'none';
  if (run.status !== 'completed' || run.conclusion === 'cancelled') return 'pending';
  return ['success', 'neutral', 'skipped'].includes(run.conclusion) ? 'pass' : 'fail';
}

function lastGreenBefore(head) {
  const runs = gh(`repos/${REPO}/actions/workflows/ci.yml/runs?per_page=100&branch=main&event=push&status=success`).workflow_runs;
  for (const r of runs) {
    try { git('merge-base', '--is-ancestor', r.head_sha, head); return r.head_sha; } catch { /* not an ancestor */ }
  }
  return null;
}

function commitsSince(base, head) {
  const range = base ? `${base}..${head}` : `-40 ${head}`;
  const rows = git('log', '--format=%H%x1f%an%x1f%s%x1f%(trailers:key=Claude-Session,valueonly,separator=%x2c)', ...range.split(' ')).split('\n').filter(Boolean);
  return rows.map((r) => {
    const [sha, , subject, trailer] = r.split('\x1f');
    const session = (trailer ?? '').split(',')[0].trim().replace(/^.*\//, '') || null;
    const files = git('show', '--name-only', '--format=', '--no-renames', sha).split('\n').filter(Boolean);
    return { sha, subject, session, files };
  });
}

/** The first main commit at or after `sha` that has a finished, non-cancelled verdict (cancelled runs were superseded by a later push). */
function coveringVerdict(sha) {
  git('fetch', '-q', 'origin', 'main');
  try { git('merge-base', '--is-ancestor', sha, 'origin/main'); } catch { return { missing: true }; }
  const chain = [sha, ...git('rev-list', '--reverse', `${sha}..origin/main`).split('\n').filter(Boolean)];
  for (const c of chain) {
    const v = verdict(checkOf(c));
    if (v === 'pass' || v === 'fail') return { sha: c, v };
  }
  return null;
}

async function main() {
  git('fetch', '-q', 'origin', 'main');
  let head = arg('--sha') ?? git('rev-parse', 'origin/main');
  const t0 = Date.now();
  const deadline = t0 + (FOR ? 25 : 20) * 60e3;
  let v;
  if (FOR) {
    const mine = git('rev-parse', FOR);
    let cov = coveringVerdict(mine);
    while (WAIT && !cov?.missing && !cov && Date.now() < deadline) { await sleep(30e3); cov = coveringVerdict(mine); }
    if (cov?.missing) { console.log(`Your commit ${mine.slice(0, 7)} is not on origin/main yet: push it first.`); process.exit(3); }
    if (!cov) { console.log(`CI has not finished for ${mine.slice(0, 7)} within ${(deadline - t0) / 60e3} min: read issue #2 or re-run this.`); process.exit(2); }
    head = cov.sha; v = cov.v;
  } else {
    v = verdict(checkOf(head));
    while (WAIT && (v === 'pending' || v === 'none') && Date.now() < deadline) {
      await sleep(30e3);
      if (!arg('--sha')) { git('fetch', '-q', 'origin', 'main'); head = git('rev-parse', 'origin/main'); }
      v = verdict(checkOf(head));
      if (v === 'none' && Date.now() - t0 > 3 * 60e3) break; // no check appeared within 3 min: CI is not running for this commit
    }
  }
  const run = checkOf(head);
  const lines = [`CI \`${CHECK}\` on main @ \`${head.slice(0, 7)}\`: **${v}**`];
  let failures = [];
  if (v === 'fail') {
    const ann = gh(`repos/${REPO}/check-runs/${run.id}/annotations?per_page=100`).map((a) => a.message ?? '');
    failures = parseFailures(ann);
    const green = lastGreenBefore(head);
    const commits = commitsSince(green, head);
    const ranked = rankSuspects(failures, commits);
    lines.push('', `Last green commit: ${green ? `\`${green.slice(0, 7)}\`` : 'unknown'}; ${commits.length} commit(s) since.`, '', '### Failing tests');
    for (const f of failures) lines.push(`- ${f}`);
    if (!failures.length) lines.push('- (could not read test names; open the CI run)');
    lines.push('', '### Most likely responsible (best guess, by overlap with the failing tests)');
    for (const c of ranked.filter((c) => c.score > 0).slice(0, 6)) lines.push(`- \`${c.sha.slice(0, 7)}\` ${c.subject.slice(0, 90)} → session \`${c.session ?? 'unknown'}\` (score ${c.score})`);
    const owner = pickOwner(ranked, commits);
    lines.push('', `### Owner: ${owner ? `session \`${owner.session}\`` : 'nobody identified (first session to read this owns it)'}`);
    if (owner) lines.push(`Why: ${owner.why}. The owner fixes this even if a neighbour's change is the real cause: someone has to, and main stays red until they do.`);
    lines.push('', '### Everyone who pushed since the last green commit', ...[...new Set(commits.map((c) => c.session ?? 'unknown'))].map((s) => `- \`${s}\``));
    lines.push(`\n::owner=${owner?.session ?? ''}`);
    if (FOR) {
      const mySession = (git('log', '-1', '--format=%(trailers:key=Claude-Session,valueonly,separator=%x2c)', git('rev-parse', FOR)).split(',')[0] ?? '').trim().replace(/^.*\//, '');
      const inRange = commits.some((c) => c.session && c.session === mySession);
      if (owner && mySession && owner.session === mySession) lines.push('', '>>> YOU ARE THE OWNER OF THIS RED. Fix it now (CLAUDE.md rule 6): even if a neighbour caused it. Push the fix, then run this command again.');
      else if (inRange) lines.push('', `>>> You pushed in the red range but the Owner is ${owner?.session ?? 'unknown'}. Within 10 minutes check whether your change can affect the failing tests and report what you found.`);
      else lines.push('', '>>> Your push is not in the red range: not yours. Say so in your final message.');
    }
    lines.push('', 'A session listed above whose change plausibly broke one of these tests must fix it now (see CLAUDE.md, "CI is red"). Fix the cause, not the test, unless the test is stale.');
  }
  const md = lines.join('\n');
  console.log(md);
  if (ISSUE) {
    const body = `# CI status for main (auto-updated)\n_Written by \`scripts/ci-status.mjs\` whenever the Deploy Manager sees a finished CI verdict. Do not edit by hand._\n\n${md}\n\n_Updated ${new Date().toISOString()}_`;
    execFileSync('gh', ['api', '-X', 'PATCH', `repos/${REPO}/issues/${ISSUE}`, '--input', '-'], { input: JSON.stringify({ body }) });
  }
  process.exit(v === 'fail' ? 1 : v === 'pending' ? 2 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e); process.exit(3); });
}
