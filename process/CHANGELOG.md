# Process changelog

Every change to a rule, instruction, hook, CI or deploy mechanism gets an entry here (newest first) with an expected effect and a review-by date, so a change is judged by what happened, not by feel. Format and workflow: `.claude/skills/process/SKILL.md`. Checked by `tests/unit/process-changelog.test.ts`.

## 2026-11-20 · #171 · Board: Statistics tab and "?" help; duties describe only how things work now
What: statistics moved to their own tab; the explanation panels (how a change ships, alerts, process, duties) live under a "?" and describe only the current model; the duties list no longer carries a "replaces" field.
Why: owner request: statistics must not sit under Queue, and explanations should only describe how things work now.
Expected effect: the Queue tab shows only the queue; the owner finds statistics and explanations without scrolling; no panel mentions the old way.
Review by: 2026-12-04
Status: pending

## 2026-11-20 · #170 · Board panels for the automation data
What: the deploy board gets an Alerts card, a "what the manager used to do" table, a Statistics card and a freshness banner, all from the `automation-data` issue (additive edit of the dashboard artifact).
Why: the owner wants everything the manager stops doing readable on the board, plus statistics on demand.
Expected effect: the owner can see current alerts, duty status and statistics on the board without asking a session; the freshness banner turns red if the automation stops.
Review by: 2026-12-04
Status: pending

## 2026-11-20 · #168 · Automation board data (alerts, duties, statistics) written by Actions
What: `scripts/automation.mjs` + `.github/workflows/automation.yml` write alerts, the list of what the manager session used to do (with replacement and status) and statistics into one issue the deploy board reads; no model, no tokens.
Why: the owner wants to see on the board everything the manager does and stops doing, and statistics on demand, with zero idle cost.
Expected effect: the board shows current alerts and duty status within 30 min of any change; the Actions job stays green; the manager session can be retired after a shadow period without losing visibility.
Review by: 2026-12-04
Status: pending

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
