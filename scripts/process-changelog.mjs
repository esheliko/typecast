// Pure parser/validator for process/CHANGELOG.md (newest first). Entry format, one per change:
//   ## 2026-11-20 · #164 · Short title
//   What: ...   Why: ...   Expected effect: ...   Review by: YYYY-MM-DD   Status: pending|confirmed|missed|n/a
// Used by tests/unit/process-changelog.test.ts; the deploy board can reuse parseChangelog.
export const STATUSES = ['pending', 'confirmed', 'missed', 'n/a'];
const HEAD = /^## (\d{4}-\d{2}-\d{2}) · (#\d+|—) · (.+)$/;
const FIELDS = ['What', 'Why', 'Expected effect', 'Review by', 'Status'];

export function parseChangelog(text) {
  const entries = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    const h = line.match(HEAD);
    if (h) { cur = { date: h[1], pr: h[2], title: h[3], fields: {}, notes: [] }; entries.push(cur); continue; }
    if (!cur) continue;
    const f = FIELDS.find((k) => line.startsWith(k + ': '));
    if (f) cur.fields[f] = line.slice(f.length + 2).trim();
    else if (line.trim()) cur.notes.push(line.trim());
  }
  return entries;
}

// Problems with the parsed entries (empty = fine).
export function validateChangelog(entries) {
  const p = [];
  if (!entries.length) return ['no entries'];
  let prev = '9999-99-99';
  for (const e of entries) {
    const who = `${e.date} ${e.pr}`;
    if (e.date > prev) p.push(`${who}: entries must be newest first`);
    prev = e.date;
    for (const k of FIELDS) if (!e.fields[k]) p.push(`${who}: missing "${k}:"`);
    if (e.fields.Status && !STATUSES.includes(e.fields.Status)) p.push(`${who}: Status must be ${STATUSES.join('|')}`);
    const rb = e.fields['Review by'];
    if (rb && !/^\d{4}-\d{2}-\d{2}$/.test(rb) && rb !== 'n/a') p.push(`${who}: Review by must be YYYY-MM-DD or n/a`);
    if (e.fields.Status === 'pending' && (!rb || rb === 'n/a')) p.push(`${who}: a pending change needs a Review by date`);
  }
  return p;
}

// Entries still pending whose review date has passed (today = YYYY-MM-DD).
export const dueReviews = (entries, today) => entries.filter((e) => e.fields.Status === 'pending' && /^\d{4}/.test(e.fields['Review by'] ?? '') && e.fields['Review by'] <= today);
