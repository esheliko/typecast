#!/usr/bin/env node
// ONE quiet watcher for the Deploy Manager session (replaces the two Monitors: ci-watch.mjs + the deploy-guard loop).
//
//   node scripts/manager-watch.mjs        run with Bash run_in_background, timeout 7200000 (2 h)
//
// Silent while main is green. Exactly one stdout line, then exit:
//   CI_RED <sha> owner=<session> tests=N :: names          (exit 0) main's `verify` is red (run `node scripts/ci-status.mjs --sha <sha>`)
//   REARM manager-watch (no red, N guard ticks, M deploys) (exit 0) 115 min passed, start it again
//   WATCH_ERROR <reason>                                   (exit 1) CI or the deploy manager unreadable for >10 min in a row
// Every 120 s it also runs the deploy guard (`git fetch`, then deploy-manager --no-poll); a `DEPLOYING ` line goes to
// $TMPDIR/manager-watch.log as `GUARD_DEPLOYED <HH:MM> IST :: <line>`, never to stdout.
// Env (tests only): MANAGER_WATCH_DEPLOY_CMD (JSON array replacing the deploy manager command), MANAGER_WATCH_CI_CMD
// (JSON array printing `<sha> ok|red|none`), MANAGER_WATCH_SCALE (divides every interval).
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newestFinished, parseRed, redReport } from './ci-watch.mjs';

export const LIMITS = { ciEveryMs: 60e3, guardEveryMs: 120e3, rearmAfterMs: 115 * 60e3, brokenAfterMs: 10 * 60e3, childTimeoutMs: 5 * 60e3 };

// Pure: what to do after a CI poll. `seen` = shas already reported. Returns 'red' | 'ok' | 'wait'.
export function ciDecision(f, seen) {
  if (!f) return 'wait';
  if (f.ok) return 'ok';
  return seen.has(f.sha) ? 'wait' : 'red';
}

// Pure: should the process end now? lastCiOk / lastGuardOk = time of the last successful read (null = never, counted from start).
export function watchStatus({ now, startedAt, lastCiOk, lastGuardOk, guardTicks, deploys }, lim = LIMITS) {
  if (now - startedAt >= lim.rearmAfterMs) return { done: true, line: `REARM manager-watch (no red, ${guardTicks} guard ticks, ${deploys} deploys)` };
  for (const [name, t] of [['CI', lastCiOk], ['deploy manager', lastGuardOk]]) {
    const gap = now - (t ?? startedAt);
    if (gap > lim.brokenAfterMs) return { done: true, line: `WATCH_ERROR cannot read ${name} for ${Math.round(gap / 60e3)} min` };
  }
  return { done: false };
}

export const istTime = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

// Pure: log lines for a guard run's output.
export function guardLines(out, d = new Date()) {
  return String(out).split('\n').filter((l) => l.includes('DEPLOYING ')).map((l) => `GUARD_DEPLOYED ${istTime(d)} IST :: ${l.trim()}`);
}

// Last reported red sha survives a restart (a re-armed watcher must not shout about a red it already reported).
export const readReported = (file) => { try { return readFileSync(file, 'utf8').trim() || null; } catch { return null; } };
export const writeReported = (file, sha) => { try { writeFileSync(file, sha + '\n'); } catch { /* best effort */ } };

const children = new Set();
const killChildren = () => { for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } } };
function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], detached: true, env: { ...process.env, STATUS_ISSUE: process.env.STATUS_ISSUE ?? '1' } });
    children.add(c);
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    const t = setTimeout(() => { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } reject(new Error('timeout')); }, timeoutMs);
    c.on('error', (e) => { clearTimeout(t); children.delete(c); reject(e); });
    c.on('close', (code) => { clearTimeout(t); children.delete(c); code === 0 ? resolve(out) : reject(new Error(`exit ${code}`)); });
  });
}

async function main() {
  const L = { ...LIMITS };
  const scale = Number(process.env.MANAGER_WATCH_SCALE) || 1;
  for (const k of Object.keys(L)) L[k] /= scale;
  const logFile = join(process.env.TMPDIR || tmpdir(), 'manager-watch.log');
  const deployCmd = process.env.MANAGER_WATCH_DEPLOY_CMD ? JSON.parse(process.env.MANAGER_WATCH_DEPLOY_CMD) : null;
  const ciCmd = process.env.MANAGER_WATCH_CI_CMD ? JSON.parse(process.env.MANAGER_WATCH_CI_CMD) : null;
  const st = { startedAt: Date.now(), lastCiOk: null, lastGuardOk: null, guardTicks: 0, deploys: 0 };
  const redFile = join(process.env.TMPDIR || tmpdir(), 'manager-watch-red');
  const seen = new Set([readReported(redFile)].filter(Boolean));
  let finished = false;
  const finish = (line, code = 0) => {
    if (finished) return;
    finished = true;
    killChildren();
    console.log(line);
    process.exit(code);
  };
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killChildren(); process.exit(0); });
  process.on('exit', killChildren);

  const ciPoll = () => {
    try {
      let f;
      if (ciCmd) { const [sha, v] = execFileSync(ciCmd[0], ciCmd.slice(1), { encoding: 'utf8' }).trim().split(' '); f = v === 'none' ? null : { sha, ok: v === 'ok' }; }
      else f = newestFinished();
      st.lastCiOk = Date.now();
      if (ciDecision(f, seen) === 'red') {
        seen.add(f.sha);
        writeReported(redFile, f.sha);
        let out = '';
        if (!ciCmd) { try { out = redReport(f.sha); } catch { /* report unreadable: still say red */ } }
        finish(parseRed(out, f.sha));
      }
    } catch { /* transient: watchStatus decides when silence means broken */ }
  };
  let guardBusy = false;
  const guardPoll = async () => {
    if (guardBusy) return;
    guardBusy = true;
    try {
      if (!deployCmd) await run('git', ['fetch', '-q', 'origin', 'main'], L.childTimeoutMs);
      const cmd = deployCmd ?? ['node', 'scripts/deploy-manager.mjs', '--no-poll'];
      const out = await run(cmd[0], cmd.slice(1), L.childTimeoutMs);
      st.lastGuardOk = Date.now(); st.guardTicks++;
      for (const l of guardLines(out)) { st.deploys++; try { appendFileSync(logFile, l + '\n'); } catch { /* best effort */ } }
    } catch { /* transient */ } finally { guardBusy = false; }
  };
  const tick = () => {
    const s = watchStatus({ ...st, now: Date.now() }, L);
    if (s.done) finish(s.line, s.line.startsWith('WATCH_ERROR') ? 1 : 0);
  };
  ciPoll();
  guardPoll();
  setInterval(ciPoll, L.ciEveryMs);
  setInterval(guardPoll, L.guardEveryMs);
  setInterval(tick, Math.min(15e3, L.ciEveryMs));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
