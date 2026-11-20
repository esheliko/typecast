# Process changelog

Every change to a rule, instruction, hook, CI or deploy mechanism gets an entry here (newest first) with an expected effect and a review-by date, so a change is judged by what happened, not by feel. Format and workflow: `.claude/skills/process/SKILL.md`. Checked by `tests/unit/process-changelog.test.ts`.

## 2026-11-20 · #167 · `/process` skill and this changelog
What: project skill `.claude/skills/process/SKILL.md` (on-demand process session: read the request queue, propose one batch, apply after approval in one PR) and this changelog with a format check.
Why: the owner needs one easy way to keep revising rules without a live manager; changes need an expected effect and a review date.
Expected effect: process changes arrive as one batched PR per session, each with an expected effect and review date; no process session left running afterwards.
Review by: 2026-12-04
Status: pending

## 2026-11-20 · #166 · Process requests go through an issue queue
What: feature sessions file a `process: ...` issue (label `process-request`, issue form) instead of messaging the Deploy Manager; chain-of-command rule rewritten in `rules.json`.
Why: the manager session re-bills its whole context on every wake; nothing should have to stay awake to receive requests.
Expected effect: no process requests sent to the manager session; at least one request arrives as an issue within 2 weeks.
Review by: 2026-12-04
Status: pending

## 2026-11-20 · #165 · Fix clock-dependent watcher test that turned main red
What: scaled (test) watcher runs no longer align REARM to the even-hour :46 UTC slot.
Why: #163's alignment made a unit test fail when started 5-10 min before a slot (main red 04:40 IST).
Expected effect: none (housekeeping)
Review by: n/a
Status: n/a

## 2026-11-20 · #164 · Rules have one source (`process/rules.json`)
What: `npm run rules:build` generates the standing-rule blocks in CLAUDE.md and the two hook text files; lint fails on drift or when the always-loaded text exceeds `budget.alwaysLoadedTokens` (5100).
Why: rules lived in four places ("edit all three together") and nothing limited their size.
Expected effect: a rule change edits one file; no rule drift between CLAUDE.md and the hooks; always-loaded rule text stays at or under budget.
Review by: 2026-12-04
Status: pending
