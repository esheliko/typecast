// Find sessions that stopped because of a usage limit (or failed/blocked and went quiet), so the manager can resume them.
// The claude-code-remote API is reachable only through MCP tools (no credentials for scripts), so this reads a JSON file
// holding `list_sessions` output (an array, or {sessions:[...]}) and prints ONE compact line per candidate.
// Usage: node scripts/resume-limited.mjs <list_sessions.json> [--now <iso>] [--quiet-min 20] [--max-age-h 48]
// Pure parts first (unit tested).
import { readFileSync } from 'node:fs';

const LIMIT_RE = /5[- ]?hour limit|usage limit|limit (reached|reset)|rate limit/i;
const DONE = new Set(['completed', 'archived']);

const detailOf = (s) => String(s.post_turn_summary?.status_detail ?? s.post_turn_summary?.recent_action ?? s.task_summary ?? '');
const updatedMs = (s) => Date.parse(s.updated_at ?? s.last_event_at ?? '') || 0;

// Pure: returns [{ id, title, reason }]. `now` is ms; a failed/blocked session counts only after `quietMin` minutes without activity.
export function limitedSessions(list, { now = Date.now(), quietMin = 20, maxAgeH = 48 } = {}) {
  const out = [];
  for (const s of Array.isArray(list) ? list : list?.sessions ?? []) {
    const id = s.id ?? s.session_id;
    const title = String(s.title ?? '');
    if (!id || title.startsWith('💀 (retired)')) continue;
    const bucket = s.status_bucket;
    if (DONE.has(bucket) || DONE.has(s.status) || s.archived) continue;
    const age = now - updatedMs(s);
    if (updatedMs(s) && age > maxAgeH * 3600e3) continue;
    let reason = null;
    if (LIMIT_RE.test(detailOf(s))) reason = 'limit: ' + detailOf(s).replace(/\s+/g, ' ').slice(0, 80);
    else if ((bucket === 'failed' || bucket === 'blocked') && updatedMs(s) && age >= quietMin * 60e3) reason = `${bucket}, quiet ${Math.round(age / 60e3)} min`;
    if (reason) out.push({ id, title, reason });
  }
  return out;
}

export const candidateLine = (c) => `${c.id} | ${c.title.slice(0, 50)} | ${c.reason}`;

if (process.argv[1]?.endsWith('resume-limited.mjs')) {
  const a = process.argv.slice(2);
  const opt = (n, d) => (a.includes(n) ? a[a.indexOf(n) + 1] : d);
  const file = a.find((x, i) => !x.startsWith('--') && !(i && a[i - 1].startsWith('--')));
  if (!file) { console.error('usage: node scripts/resume-limited.mjs <list_sessions.json> [--now iso] [--quiet-min 20] [--max-age-h 48]'); process.exit(2); }
  const found = limitedSessions(JSON.parse(readFileSync(file, 'utf8')), {
    now: opt('--now') ? Date.parse(opt('--now')) : Date.now(), quietMin: Number(opt('--quiet-min', 20)), maxAgeH: Number(opt('--max-age-h', 48)),
  });
  console.log(found.length ? found.map(candidateLine).join('\n') : 'NO_LIMITED_SESSIONS');
}
