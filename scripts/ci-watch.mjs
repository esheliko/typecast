#!/usr/bin/env node
// Prints ONE line whenever main's CI changes state, for a Claude session to act on (run it under the Monitor tool).
//
//   node scripts/ci-watch.mjs [--once]
//
//   CI_RED   <sha> owner=<session id> tests=<n> :: <failing test titles>   a new red (or a reminder every 45 min while it stays red)
//   CI_GREEN <sha>                                                         main is green again
//
// The watching session then messages the owner (send_message) with the failing tests. Nothing here can reach a session by itself: GitHub Actions has no
// access to Claude, so a Claude session that stays alive and listens is the delivery channel (see DEPLOYING.md).
import { execFileSync } from 'node:child_process';

const REPO = 'esheliko/typecast';
const once = process.argv.includes('--once');
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 64e6 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newestFinished() {
  sh('git', ['fetch', '-q', 'origin', 'main']);
  const shas = sh('git', ['log', '--format=%H', '-8', 'origin/main']).split('\n');
  for (const sha of shas) {
    const runs = JSON.parse(sh('gh', ['api', `repos/${REPO}/commits/${sha}/check-runs?per_page=100`])).check_runs.filter((r) => r.name === 'verify');
    runs.sort((a, b) => Date.parse(b.started_at ?? 0) - Date.parse(a.started_at ?? 0));
    const r = runs[0];
    if (r && r.status === 'completed' && r.conclusion !== 'cancelled') return { sha, ok: ['success', 'neutral', 'skipped'].includes(r.conclusion) };
  }
  return null;
}

let last = null; // 'sha:red' | 'green'
let lastRedAt = 0;
for (;;) {
  try {
    const f = newestFinished();
    if (f) {
      if (f.ok && last !== 'green') { console.log(`CI_GREEN ${f.sha.slice(0, 7)}`); last = 'green'; }
      if (!f.ok) {
        const key = `${f.sha}:red`;
        if (last !== key || Date.now() - lastRedAt > 45 * 60e3) {
          const out = sh('node', ['scripts/ci-status.mjs', '--sha', f.sha]).toString();
          const owner = (out.match(/^::owner=(.*)$/m) ?? [])[1] ?? '';
          const tests = [...out.matchAll(/^- (tests\/.+)$/gm)].map((m) => m[1].replace(/^tests\/smoke\//, ''));
          console.log(`CI_RED ${f.sha.slice(0, 7)} owner=${owner || 'none'} tests=${tests.length} :: ${tests.join(' | ')}`);
          last = key; lastRedAt = Date.now();
        }
      }
    }
  } catch (e) {
    // ci-status exits 1 on a red head and prints the report on stdout: that is the normal case, parse it.
    if (e.stdout) {
      const out = String(e.stdout);
      const sha = (out.match(/@ `([0-9a-f]{7})`/) ?? [])[1] ?? '?';
      const owner = (out.match(/^::owner=(.*)$/m) ?? [])[1] ?? '';
      const tests = [...out.matchAll(/^- (tests\/.+)$/gm)].map((m) => m[1].replace(/^tests\/smoke\//, ''));
      const key = `${sha}:red`;
      if (last !== key || Date.now() - lastRedAt > 45 * 60e3) { console.log(`CI_RED ${sha} owner=${owner || 'none'} tests=${tests.length} :: ${tests.join(' | ')}`); last = key; lastRedAt = Date.now(); }
    } else console.error('ci-watch error:', String(e.message).slice(0, 160));
  }
  if (once) break;
  await sleep(60e3);
}
