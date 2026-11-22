// After main's `verify` turns green again, find open PRs that went red (or never got a verdict) while main was red and do not contain the green commit.
// Used by automation.mjs (stuck PRs); the stale-red part is kept for the planned notice. Pure parts first (unit tested); `findCandidates` is the only part that talks to GitHub.
import { execFileSync } from 'node:child_process';

const REPO = '{{REPO}}';

export const prKey = (p) => `${p.number}@${p.head}`;

// Pure: candidates = [{ number, head, verify: 'red'|'ok'|'pending'|'none', contains: bool, session? }]; seen = Set of prKey already reported.
// Stale = latest verify red or missing, head does not contain the green main commit, not reported before for this head.
export function staleRedPrs(candidates, seen) {
  return candidates.filter((p) => (p.verify === 'red' || p.verify === 'none') && !p.contains && !seen.has(prKey(p))).sort((a, b) => a.number - b.number);
}

// Pure: the one stdout line (null when nothing to say).
export function staleLine(stale, sha) {
  if (!stale.length) return null;
  const sessions = stale.filter((p) => p.session).map((p) => `#${p.number}:${p.session}`);
  return `STALE_RED_PRS ${stale.map((p) => `#${p.number}`).join(',')} (main green again at ${String(sha).slice(0, 7)})${sessions.length ? ` sessions=${sessions.join(',')}` : ''}`;
}

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64e6 }));

// Pure: verify verdict out of a check-runs payload.
export function verifyVerdict(checkRuns) {
  const runs = checkRuns.filter((r) => r.name === 'verify').sort((a, b) => Date.parse(b.started_at ?? 0) - Date.parse(a.started_at ?? 0));
  const r = runs[0];
  if (!r) return 'none';
  if (r.status !== 'completed') return 'pending';
  if (r.conclusion === 'cancelled') return 'none';
  return ['success', 'neutral', 'skipped'].includes(r.conclusion) ? 'ok' : 'red';
}

export function findCandidates(fixSha) {
  const out = [];
  for (const pr of gh(`repos/${REPO}/pulls?state=open&per_page=50`)) {
    const head = pr.head.sha;
    const verify = verifyVerdict(gh(`repos/${REPO}/commits/${head}/check-runs?per_page=100`).check_runs);
    if (verify === 'ok' || verify === 'pending') continue;
    let contains = false;
    try { contains = ['ahead', 'identical'].includes(gh(`repos/${REPO}/compare/${fixSha}...${head}`).status); } catch { /* unknown: treat as not containing */ }
    let session;
    try {
      const commits = gh(`repos/${REPO}/pulls/${pr.number}/commits?per_page=100`);
      for (const c of commits.reverse()) { const m = c.commit.message.match(/Claude-Session:\s*\S*?(session_\w+)/); if (m) { session = m[1]; break; } }
    } catch { /* optional */ }
    out.push({ number: pr.number, head, verify, contains, session });
  }
  return out;
}

// --- Stuck PRs (2026-11-20): an open PR older than ~2 h that never got a `verify` run, or that conflicts with main. Used by automation.mjs.
export const STUCK_AFTER_MS = 2 * 3600e3;
export const STUCK_QUIET_MS = 10 * 60e3; // a PR touched in the last 10 min may just be waiting for its first CI run

// Pure: prs = [{ number, head, createdAt, updatedAt, draft?, verify, mergeable (true|false|null), session? }]; seen = Set of `${prKey}:${reason}`.
// Returns [{ ...pr, reasons: ['no-verify'|'conflict'] }] for PRs not yet reported with that reason.
export function stuckPrs(prs, seen, now = Date.now()) {
  const out = [];
  for (const p of prs) {
    if (p.draft || now - Date.parse(p.createdAt) < STUCK_AFTER_MS) continue;
    const reasons = [];
    if (p.verify === 'none' && now - Date.parse(p.updatedAt) >= STUCK_QUIET_MS) reasons.push('no-verify');
    if (p.mergeable === false) reasons.push('conflict');
    const fresh = reasons.filter((r) => !seen.has(`${prKey(p)}:${r}`));
    if (fresh.length) out.push({ ...p, reasons: fresh });
  }
  return out.sort((a, b) => a.number - b.number);
}

// Pure: the one stdout line (null when nothing to say).
export function stuckLine(stuck) {
  if (!stuck.length) return null;
  const sessions = stuck.filter((p) => p.session).map((p) => `#${p.number}:${p.session}`);
  return `STUCK_PRS ${stuck.map((p) => `#${p.number}(${p.reasons.join('+')})`).join(',')}${sessions.length ? ` sessions=${sessions.join(',')}` : ''}`;
}

export const stuckKeys = (stuck) => stuck.flatMap((p) => p.reasons.map((r) => `${prKey(p)}:${r}`));

// Talks to GitHub: one list call, then check-runs / mergeable only for PRs old enough to matter.
export function findStuckCandidates(now = Date.now()) {
  const out = [];
  for (const pr of gh(`repos/${REPO}/pulls?state=open&per_page=50`)) {
    if (pr.draft || now - Date.parse(pr.created_at) < STUCK_AFTER_MS) continue;
    const head = pr.head.sha;
    const verify = verifyVerdict(gh(`repos/${REPO}/commits/${head}/check-runs?per_page=100`).check_runs);
    let mergeable = null;
    try { const d = gh(`repos/${REPO}/pulls/${pr.number}`); mergeable = d.mergeable_state === 'dirty' ? false : d.mergeable; } catch { /* unknown */ }
    let session;
    try {
      for (const c of gh(`repos/${REPO}/pulls/${pr.number}/commits?per_page=100`).reverse()) { const m = c.commit.message.match(/Claude-Session:\s*\S*?(session_\w+)/); if (m) { session = m[1]; break; } }
    } catch { /* optional */ }
    out.push({ number: pr.number, head, createdAt: pr.created_at, updatedAt: pr.updated_at, draft: !!pr.draft, verify, mergeable, session });
  }
  return out;
}
