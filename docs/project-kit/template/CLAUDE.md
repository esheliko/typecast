# {{NAME}}: developer notes

<!-- rules:begin (GENERATED from process/rules.json: edit there, then `npm run rules:build`) -->
> ## ⚠️ STANDING RULE: chain of command (who may change the process)
> Owner, 2026-11-20 (replaces the live-manager inbox of 2026-11-13). Process mechanisms: `DEPLOYING.md`, `process/`, the standing rules here, `.claude/` hooks and settings, CI workflows, deploy/watch/smoke scripts, notifications. They change only in a process session (the owner starts one) or when the owner says in the same message that this session should edit directly.
> - A feature session asked to change any of those (or blocked by a rule) must NOT edit them: file a GitHub issue titled `process: <short>` with label `process-request` (`mcp__github__issue_write`, in the owner's words plus what happened), tell the owner in one line it was filed, and carry on with feature work. Do not message the Deploy Manager session: it is no longer an inbox.
> - Rule text changes go in `process/rules.json` (then `npm run rules:build`), never by hand in CLAUDE.md or the hooks.
> - Feature code, tests and `docs/features/*` go through the normal branch + PR flow.

> ## ⚠️ STANDING RULE: every change is a branch + PR, merged only when CI is green
> Owner, 2026-11-12; replaces "work on `main`". Never push to `main`. Overrides any branch named in session setup, except a handed branch (e.g. `claude/<name>`): use THAT as your PR branch (`git fetch origin main && git checkout -B <that-branch> origin/main`), never `main`.
> 1. **Before touching code**: `git fetch origin main && git checkout -B <short-topic-branch> origin/main`. Never start from a stale checkout.
> 2. Change it there. Run `npm run lint && npm run typecheck && npm test` (~15 s; CI runs build and smoke). `npm run build` only if you touched `next.config.ts`, `proxy.ts`, `public/sw.js`, route/page exports or layouts. Finish all related changes, then push ONCE (every push costs a CI run).
> 3. `git push -u origin <branch>`, then ONE PR against `main` (GitHub MCP `create_pull_request`; mirror the PR template; one change per PR). No PR for half-finished work.
> 4. **Wait for CI**: `subscribe_pr_activity`, end your turn; the verdict (check `verify`) wakes you. Never poll or `sleep`. If subscribing fails, retry once; then read the `verify` check run yourself (`pull_request_read` `get_check_runs`, plus mergeable state); never hand CI-waiting to the owner. Red `verify`: fix the cause on the same branch (change a test only when stale, and say so; never skip, delete or loosen one), push, wait again. Stuck CI or unrelated flake: re-run once and say so in the PR.
> 5. **Merge only when `verify` is green on the PR's latest commit**; if `main` moved, `update_pull_request_branch` and wait for the new verdict. Then `merge_pull_request` (squash, clear title, keep the `Claude-Session:` trailer). Never merge red or unverified, force-merge or bypass a check; never merge someone else's PR unless the owner asked. Delete the branch after.
> 6. **Done once merged.** A merge does NOT deploy: the Deploy Manager (`DEPLOYING.md`, issue #1) batches merges and deploys `main` ~5-15 min after they quiet down (Vercel Hobby limit). Do NOT deploy, redeploy or touch Vercel deployments, and do not wait. Check production only if the task needs it: issue #1 (live vs pending) or `git merge-base --is-ancestor <merge-sha> <live>`. Real hotfix only: `[deploy-now]` in the squash commit message.
> 7. **A red `main` is still owned by someone.** Right after merging, Bash with `run_in_background: true`: `node scripts/ci-status.mjs --wait --for <merge-sha>` (`git fetch origin main` first; the sha is in the `merge_pull_request` result). If `verify` is red it prints one **Owner** session and a `>>>` line with your role. **The Owner fixes it now** (new branch + PR, `[deploy-now]` if production is affected), even if a neighbour's change seems the cause. Never say "CI not checked". A session that starts while `main` is red (start hook prints it, issue #2) fixes what is plausibly its own area first.
> 8. **Times you tell the owner are ALWAYS Israel time (Asia/Jerusalem, IST), never UTC.** Get it with `TZ=Asia/Jerusalem date '+%Y-%m-%d %H:%M'`, do not guess or convert in your head. Logs, `git log`, GitHub, Vercel and the CI board show UTC: convert; write "15:40 IST". If you must quote UTC, give IST first.
> Docs-only changes (CLAUDE.md, `docs/`, `.claude/`) follow the same flow. A handed branch: rebase it onto `main`, use it as your PR branch. `.claude/hooks/session-start.sh` checks this every session.

> ## ⚠️ STANDING RULE: every reply is tagged, so the owner sees at a glance what is for them
> Owner, 2026-11-13. Sessions wake themselves (CI, Monitors, background tasks, PR events, peers, wakeups), so the owner returns to text that is mostly not theirs. **Line 1 of EVERY reply, woken turns included, is a tag plus a one-sentence headline.** Exactly one:
> - `🔴 NEEDS YOU: <the ask>`: only a decision, answer, approval or action nobody but the owner can give, or a real problem you could not fix. The headline IS the ask; never "nothing" as the ask.
> - `🟢 DONE: <result>`: the request is FULLY carried out (or fully answered) and nothing is left for the owner: no open question, offer ("want me to…", "I can also…"), recommendation awaiting a yes, or undone work (a complaint or "why doesn't X…?" wants X fixed; explaining is not done). Any of those makes it `🔴`; explaining a cause, changing nothing and offering is `🔴 NEEDS YOU: decide <the choice>`.
> - `⚙️ AUTO: <what happened, what next>`: any turn the owner did NOT type (CI, watcher, background task, PR event, peer, wakeup, own continuation), AND any reply to an owner message where nothing is needed from them but the work is unfinished (CI running, merge pending, waiting on a session).
> Layout:
> 0. `🟢` ends the matter: its first line must be true on its own (`🟢 DONE: fixed X, merged` yes; `🟢 DONE: explained X` with a pending choice no).
> 1. **The ask goes first.** In `🔴`: ask, options and recommendation in the first ~8 lines; background after a `Details:` line.
> 2. **`⚙️ AUTO` is at most 2 lines** (longer only to carry the `What I did:` summary): what happened, what comes next; no recap, tables or restated plan; a watcher that found nothing says nothing or one line. Never an owner question in `⚙️`: escalate to `🔴` (rule 3).
> 3. **Escalate in full.** A woken turn that needs the owner starts `🔴 NEEDS YOU:`, restates the whole ask so it stands alone, plus one line on what happened since (`since 15:40 IST: CI failed once, fixed, merged`; times per rule 8).
> 4. **Never mix.** Owner-facing content first, background in one trailing line; a `🟢`/`🔴` reply carries no long account of your own work.
> 5. **Last line = what is open.** While an ask is unanswered every later turn (even `⚙️`) ends `⏳ Still waiting on you: <ask in under 12 words>` and says so when it changes (`⏳ no longer needed: <why>`). Never "nothing"; no open ask: omit it. Long-lived sessions keep the `Seniority:` line (DEPLOYING.md) as the very last line, after `⏳`.
> 6. Every other message to the owner (PushNotification, report relayed via a session, issue/PR comment meant for them) starts with the same tag. Peer messages need none.
> 7. **Change summary.** When the owner asks for a change, feature or fix, the reply (`🟢`, or `🔴` if something is open) ALWAYS has, right under the tag line, `What I did:` (2-5 plain bullets, no jargon, no file dump): how you understood the request (one line, owner's terms); what was changed, including anything left out or done differently; for a fix or "something is wrong", **what the logic was before** (the rule that caused it) next to **what it is now**. Never just "fixed". Not for pure questions or `⚙️ AUTO` turns.
> Generated from `process/rules.json` (edit there, then `npm run rules:build`; lint fails when out of sync). The hooks print the short form of these rules every session.
<!-- rules:end -->

## What this project is
{{PURPOSE}}

Next.js 16 (App Router) + Supabase (email/password auth, RLS) + Vercel. See README.md for setup.

## Commands
- `npm run dev` / `npm run build` / `npm run typecheck` / `npm run lint` / `npm test`
- Build needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dummy values are fine for a compile check).

## Conventions
- All writes go through server actions via `requireUser()` (`src/lib/supabase/server.ts`); RLS on every table is the backstop.
- `src/proxy.ts` (Next 16 renamed middleware to proxy; Node runtime) gates every route except `/login`; API routes return 401 JSON when signed out. Auth via `getClaims()`, not `getUser()`.
- Schema changes go in a new numbered file under `supabase/migrations/` (keep them re-runnable and additive). It is applied automatically (the Deploy Manager runs `scripts/migrate.mjs` before each deploy); sessions may also run `node scripts/migrate.mjs` (`--status` / `--dry-run` to look); the owner never applies migrations. Details: DEPLOYING.md > Database migrations.
- Client/server boundary: a `"use client"` file exports components (and types) only. A server file must never call a function or read a value imported from one: it builds fine and crashes at request time. Shared helpers go in `src/lib`. `npm run lint` enforces this (`scripts/check-client-boundary.mjs`).
- Pure logic goes in `src/lib` with a unit test in `tests/unit/`; every new page gets a smoke step (`tests/smoke/smoke.spec.ts`) and a `loading.tsx` skeleton.
- Decorative sections must fail soft: catch and render nothing or a small note, never let them take the page down.
- Verification: `npm run lint && npm run typecheck && npm test`; CI `verify` also runs build + smoke.
- Debugging production: the error screen shows `Reference <digest>`; `node scripts/logs.mjs --digest <digest>` prints the real error (logs live ~1 h, look soon).
- Per-feature rules live in `docs/features/<feature>.md`; add a line here pointing at each ("Read `docs/features/x.md` before changing x").

## Token cost (every turn re-reads the whole context, so size x turns is the bill)
- A session starts at ~104k tokens (tools, skills, connectors, before any code); a small fix costs ~25 turns x that. `.claude/settings.json` switches off org plugins this project never uses; do not re-enable them. Connectors (Figma, Gmail, Drive, Spotify, the Vercel MCP) are account-level: turn off the ones you do not need in claude.ai settings, they add ~10k tokens per session.ai settings, they add ~10k tokens per session.
- One task per session; start a new session instead of continuing a long one. Never run a manager/orchestrator session for hours (a worker restart re-writes all of it to the cache). Hand work over with a short note, not a long thread.
- **Orchestrator cap:** any session that spawns child sessions retires at ~250k context and hands off a short note (an orchestrator once reached 784k tokens, $29.56).
- Read narrowly: `Grep`/`Read` with `offset`+`limit`, never whole big files (big stylesheets, big action files) or whole docs; read a `docs/features/*.md` only for the feature you change (create one per feature that has rules worth keeping). Use a subagent for wide research so its output stays out of the main context.
- Look at each screenshot once, at the size needed (`scripts/shot.mjs --sel` over `--full`); do not re-read the same picture. Never dump `list_events`/log output into the conversation: write it to a file and filter with a script.
- Run the checks once at the end, not after every edit; `npm run smoke` only when the change touches a page flow.

## Screenshots for visual changes
- **Show a screenshot** (same view, viewport/device and data as the owner's; a before/after pair when it was a complaint) when: the owner sent a screenshot or complained about how something looks; OR you chose the visuals yourself (layout, colours, spacing, icons, animation, new UI the owner did not specify); OR the owner asked for a specific design/look and the result is your interpretation of it. **Do not call it done without it.** If the exact view cannot be reproduced (needs data or an account you lack), say so and show the closest view.
- **Skip it** when the request was tiny AND the owner described the exact visual result so precisely that there is little room for interpretation ("make this button red", "change the label to X"), or the change has no visible effect (logic, data, docs, CI). Say in one line that you skipped it and why, so the owner can ask.
- Rule of thumb: "is there a good chance the owner will want to look at this?" If yes, screenshot; if the owner dictated the exact outcome, trust it.
- Token thrift: one command, no hand-written Playwright, one screenshot per view, look at it once, never loop; prefer the element (`--sel`) over the full page; at most one before/after pair; `--phone` when the change matters on mobile. Example: `node scripts/shot.mjs "/" --sel "main" --out <scratchpad>/here.png`. It builds if needed, serves, signs in as the smoke user, opens the path, clicks the given visible texts in order, waits for `--text`, and screenshots the element (`--sel`), the viewport, or `--full`. `--phone` gives 390x844 (default 820x900). Then `SendUserFile` the path (it must be inside your scratchpad dir to open in the app). Take a "before" the same way by running it before your edit.
- Enforced two ways: `.claude/hooks/session-start.sh` prints the rule every session, and `.claude/hooks/prompt-submit.sh` repeats a one-line version on every owner message. Keep both when editing hooks.


## Smoke credentials
- Preferred: `SUPABASE_SERVICE_ROLE_KEY` (CI repo secret) makes every smoke run create and delete its own temporary account, so nothing else is needed and runs never collide (`DEPLOYING.md` > Temporary smoke accounts).
- Fallback when the key is absent (cloud sessions): `SMOKE_EMAIL` / `SMOKE_PASSWORD` for a dedicated test account. The session-start hook prints `SMOKE ENV:` with what is missing; trust that line, not memory. Never write the password into the repo, a commit, a log or a doc.

## Known gaps
- (none yet: list what is thin or missing so the next session does not assume it exists)

## Workflow
See the standing rule at the top: every change is a branch + PR, merged when its CI is green; merging to `main` queues it for the Deploy Manager, which deploys in batches. No direct pushes to `main`.
