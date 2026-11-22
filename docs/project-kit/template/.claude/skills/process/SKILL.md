---
name: process
description: Run a process session for {{NAME}}. Use when the owner says /process, "process session", or asks to change a rule, instruction, hook, CI or deploy mechanism. Reads the process-request queue, proposes one batch, applies it after approval in one PR.
---

# Process session (on demand, no idle cost)

Changes rules and mechanisms, nothing else. Short and cold: start, decide, merge, stop. No watchers, no heartbeat, no scheduled task, no child sessions.

## Read only this (not DEPLOYING.md whole, not CLAUDE.md beyond the top)
1. Open requests: `mcp__github__list_issues` (`labels: ["process-request"]`, `state: OPEN`). Read bodies only for those.
2. `process/rules.json` (the rules; the single source) and the head of `process/CHANGELOG.md` (last ~5 entries, any `Status: pending` past its review date).
3. Anything the owner pasted. Read other files only for the change at hand, with `offset`/`limit`.

## Do
1. **Propose one batch** to the owner in the reply format (`🔴 NEEDS YOU:` first line): what you will change, per request, with your recommendation. Merge requests that touch the same files; drop or push back on requests that add always-loaded text without removing some (budget: `process/rules.json` `budget`).
2. After the owner says yes: `git fetch origin main && git checkout -B <topic> origin/main`. Edit `process/rules.json`, run `npm run rules:build` (never hand-edit the generated CLAUDE.md block or `.claude/hooks/rules-*.txt`). Other process files (`DEPLOYING.md`, `.claude/`, `scripts/`, CI) are edited directly.
3. Add one entry per change to `process/CHANGELOG.md` (format below) with an **expected effect and a review-by date**. A change with no measurable effect says `Expected effect: none (housekeeping)` and `Status: n/a`.
4. Run `npm run lint && npm run typecheck && npm test`, push once, ONE PR (mirror the PR template, put the same expected effect in it), `subscribe_pr_activity`, merge when `verify` is green, then the post-merge `ci-status --wait` (CLAUDE.md rules 4-7).
5. Close each handled issue with a comment `done in <PR link>` (`mcp__github__add_issue_comment`, `issue_write` state closed). Reply `🟢 DONE` with `What I did:` bullets and stop. Do not keep the session alive.

## Changelog entry format (`process/CHANGELOG.md`, newest first; checked by a unit test)
```
## 2026-11-20 · #164 · Short title
What: one line.
Why: one line.
Expected effect: the metric or behaviour that should change.
Review by: 2026-12-04
Status: pending
```
`Status` is `pending`, `confirmed`, `missed` or `n/a`. At a review, set the status and add one line on what the evidence showed. A `missed` change is reverted or reworked in the next batch.

## Rules for this session
- Times to the owner in IST. Never put secrets in rules or issues.
- Do not touch feature code here. A feature bug found on the way becomes its own issue or session.
- Keep the session's own cost low: no wide reads, no subagents unless a read would be huge.
