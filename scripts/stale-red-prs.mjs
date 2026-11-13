// After main's `verify` turns green again, find open PRs that went red (or never got a verdict) while main was red and do not contain the green commit.
// Used by manager-watch.mjs. Pure parts first (unit tested); `findCandidates` is the only part that talks to GitHub.
import { execFileSync } from 'node:child_process';

const REPO = 'esheliko/typecast';

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
