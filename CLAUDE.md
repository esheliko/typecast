# Typecast: developer notes

> ## ⚠️ STANDING RULE: chain of command (who may change the process)
> Added by the Deploy Manager 2026-11-13. The Deploy Manager (session titled exactly "🚀 Deploy manager (typecast)"; find its id with `list_sessions`, ignore titles starting "💀 (retired)"; the title is the lookup key) alone owns deploy/CI/process mechanisms: `DEPLOYING.md`, the standing rules here, `.claude/` hooks and settings, CI workflows, deploy/watch/smoke scripts, notifications.
> - If the owner asks a feature session to change any of those, it must NOT edit them: send the request, in the owner's words, to the manager (`mcp__claude-code-remote__send_message`), tell the owner in one line it was passed on, and carry on with feature work. The manager has a worker make the change.
> - Feature code, tests and `docs/features/*` go through the normal branch + PR flow.
> - Exception: the owner says in the same message that this session should edit it directly.

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
> `.claude/hooks/session-start.sh` and `.claude/hooks/prompt-submit.sh` repeat this; keep both when editing hooks.

Next.js 16 (App Router) + Supabase (email/password auth, RLS) + TMDB. See README.md for setup.

## Commands
- `npm run dev` / `npm run build` / `npm run typecheck` / `npm run lint`
- Build needs `TMDB_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dummy values are fine for a compile check).

## Conventions
- TMDB is only called server-side (`src/lib/tmdb.ts`); the token never reaches the browser.
- All writes go through server actions in `src/app/actions.ts` via `requireUser()`; RLS on `library_items` and `profiles` is the backstop.
- `src/proxy.ts` (Next 16 renamed middleware to proxy; Node runtime) gates every route except `/login` and `/offline`; API routes return 401 JSON when signed out.
- `public/sw.js` caches only static assets, never images (its CSP connect-src blocks the CORS refetch, which blanked posters on phones in v4; the browser HTTP cache serves TMDB images); pages are always network-first. Bump the cache names when changing caching rules.
- Schema changes go in a new numbered file under `supabase/migrations/` (keep them re-runnable). Schema changes: add the file; it is applied automatically (the Deploy Manager runs `scripts/migrate.mjs` before each deploy); sessions may also run `node scripts/migrate.mjs` themselves (`--status` / `--dry-run` to look); the owner never applies migrations. Details: DEPLOYING.md > Database migrations.
- Titles and people open as a popup (intercepting routes `(.)title`/`(.)person`, one `Modal` frame). Link with `TitleLink` / `PersonLink` (`components/Modal.tsx`), never a bare `Link`; popup trail classes are `ptrail-`, never reuse `wx-`. Details: `docs/dev-notes.md#popup`.
- Speed: functions stay in `bom1` next to Supabase; auth via `getClaims()`, not `getUser()`; nothing in `app/(app)/layout.tsx` may await TMDB; every page needs a shaped `loading.tsx` skeleton; pass `it={item}` to `TitleLink`. Details: `docs/dev-notes.md#speed`.
- Awards (Wikidata by IMDb id, `src/lib/awards.ts`) fail soft. Read `docs/features/awards.md` before changing.
- Watch next: pure `rankUpNext` (`src/lib/upnext.ts`, unit tested). Read `docs/features/watch-next.md` before changing.
- Upcoming (Library, `/cal/<token>.ics`): pure logic `src/lib/upcoming.ts`; never log the calendar token. Read `docs/features/upcoming.md` before changing.
- Search: pure `layoutSearch` (`src/lib/search-intent.ts`) + "Who's that?" mode. Read `docs/features/search.md` before changing.
- Import: one card (`parseAny`, `resolveEntries`; unsure matches are NOT saved until confirmed). Run `npm run eval:import` before and after matcher changes; read `docs/features/import.md` before changing.
- Episodes / progress / appearances: pure helpers `src/lib/episodes.ts`; faces scoped to the spoiler line. Read `docs/features/series.md` before changing.
- A quick mark is ONE database write and nothing else: never add `done()`/`revalidatePath` to a quick-mark action; `LibProvider` is the truth on screen. Read `docs/features/marks.md` before changing.
- Client/server boundary: a `"use client"` file exports components (and types) only. A server file must never call a function or read a value imported from one: it builds fine and crashes at request time ("Attempted to call X() from the server"). Shared helpers go in `src/lib`. `npm run lint` enforces this (`scripts/check-client-boundary.mjs`).
- Lint: React Compiler rules are off on purpose; turn them on only with a cleanup. Details: `docs/dev-notes.md#lint`.
- Verification: `npm run lint && npm run typecheck && npm test`; CI `verify` also runs build + smoke + `visual.spec.ts`; add a smoke step for any new page/data branch, a unit test for new pure logic, new pages to the visual `PAGES` list; any change to `public/sw.js` or the CSP must keep `visual.spec.ts` green. Details: `docs/dev-notes.md#verification`.
- Debugging production: error screen shows `Reference <digest>`; `node scripts/logs.mjs --digest <digest>` prints the real error (logs live ~1 h, look soon). Details: `docs/dev-notes.md#debug`.
- Every title list offers Both / Films / Series: wrap it in `KindFilter` (or use `KindSeg` + `ofKind` from `src/lib/kind.ts`); the switch appears when the list holds both kinds. Library keeps it in the URL (`?k=movie|tv`).
- "Today" is the user's own day, never `new Date().toISOString().slice(0, 10)`; use `src/lib/today.ts` (`tzOf`, `todayFor`). Details: `docs/dev-notes.md#today`.
- Where to watch has gaps: a country with no entry is "we don't know", never "Not available"; use pure `whereVerdict` (`src/lib/where.ts`). Details: `docs/dev-notes.md#where`.
- Decorative sections (suggestions, awards, marks) must fail soft: catch and render nothing or a small note, never let them take the page down.
- Watching now (`/watching`): no runtime AI; later episodes are never shown while spoilers are hidden; never reuse a `wx-` class name (grep first). Read `docs/features/watching-now.md` and `docs/features/who.md` before changing.
- Glimpse (profile-card sheet on titles, cast, credits): spoiler-scoped on /watching. Read `docs/features/glimpse.md` before changing.
- Spoiler line: a Watching series' saved place is its spoiler line everywhere; pure rules `src/lib/spoiler-line.ts`, enforced server-side (`lineFor`). Read `docs/features/spoilers.md` before changing.
- Film resume (`stopped_min`/`stopped_of`): ONE debounced write; opening the sheet writes nothing. Read `docs/features/film-resume.md` before changing.
- Place card / quick Watched ✓ / Continue card: pure `src/lib/place-strip.ts`; one write via `useSavedPlace`. Read `docs/features/place-card.md` before changing.
- `artifact.html` is the legacy single-file prototype, not part of the site.

## Token cost (every turn re-reads the whole context, so size x turns is the bill)
- A session starts at ~105k tokens (tools, skills, connectors) before it reads any code; a small fix costs ~25 turns x that. `.claude/settings.json` switches off the org plugins this project never uses (design, product-management, cowork, vercel); do not re-enable them. Connectors (Figma, Gmail, Drive, Spotify, the Vercel MCP) are account-level: turn them off in claude.ai settings, they add ~10k tokens per session.
- One task per session; start a new session instead of continuing a long one. Never run a manager/orchestrator session for hours (a worker restart re-writes all of it to the cache). Hand work over with a short note, not a long thread.
- **Orchestrator cap:** any session that spawns child sessions retires at ~250k context and hands off a short note (one reached 784k tokens, $29.56).
- Read narrowly: `Grep`/`Read` with `offset`+`limit`, never whole big files (`globals.css`, `actions.ts`) or whole docs; read a `docs/features/*.md` only for the feature you change. Use a subagent for wide research so its output stays out of the main context.
- Look at each screenshot once, at the size needed (`scripts/shot.mjs --sel` over `--full`); do not re-read the same picture. Never dump `list_events`/log output into the conversation: write it to a file and filter with a script.
- Run the checks once at the end, not after every edit; `npm run smoke` only when the change touches a page flow.

## Screenshots for visual changes
- **Show a screenshot** (same view, viewport/device and data as the owner's; a before/after pair when it was a complaint) when: the owner sent a screenshot or complained about how something looks; OR you chose the visuals yourself (layout, colours, spacing, icons, animation, new UI the owner did not specify); OR the owner asked for a specific design/look and the result is your interpretation of it. **Do not call it done without it.** If the exact view cannot be reproduced (needs data or an account you lack), say so and show the closest view.
- **Skip it** when the request was tiny AND the owner described the exact visual result so precisely that there is little room for interpretation ("make this button red", "change the label to X"), or the change has no visible effect (logic, data, docs, CI). Say in one line that you skipped it and why, so the owner can ask.
- Rule of thumb: "is there a good chance the owner will want to look at this?" If yes, screenshot; if the owner dictated the exact outcome, trust it.
- Token thrift: one command, no hand-written Playwright, one screenshot per view, look at it once, never loop; prefer the element (`--sel`) over the full page; at most one before/after pair; `--phone` when the change matters on mobile. Example: `node scripts/shot.mjs "/watching?k=tv-79744&s=3&e=8" --click "Brent Huff" --sel "section:has-text('episodes of')" --out <scratchpad>/here.png`. It builds if needed, serves, signs in as the smoke user, opens the path, clicks the given visible texts in order, waits for `--text`, and screenshots the element (`--sel`), the viewport, or `--full`. `--phone` gives 390x844 (default 820x900). Then `SendUserFile` the path (it must be inside your scratchpad dir to open in the app). Take a "before" the same way by running it before your edit.
- Enforced two ways: `.claude/hooks/session-start.sh` prints the rule every session, and `.claude/hooks/prompt-submit.sh` repeats a one-line version on every owner message. Keep both when editing hooks.

## Smoke credentials
- Preferred: `SUPABASE_SERVICE_ROLE_KEY` (CI repo secret) makes every smoke run create and delete its own temporary account, so nothing below is needed and runs never collide (`DEPLOYING.md` > Temporary smoke accounts). The rest of this section is the shared-account fallback used when the key is absent (cloud sessions).
- CI reads them from GitHub repo secrets (`SMOKE_EMAIL`, `SMOKE_PASSWORD`, Supabase URL/anon key, `TMDB_TOKEN`); sessions cannot read those. In a cloud session they come from the environment `typecast` (variables set in its settings): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public), `SMOKE_EMAIL` and a dummy `TMDB_TOKEN` (the proxy injects the real one) are saved there. `SMOKE_PASSWORD` is NOT saved: the environment tool refuses to store secrets as variables. The session-start hook prints `SMOKE ENV:` with what is missing; trust that line, not memory. Never write the password into the repo, a commit, a log or a doc.

## Known gaps
- Test coverage is thin: unit tests cover only a few pure `src/lib` modules; the smoke test covers page loads, not behaviour.

## Workflow
See the standing rule at the top: every change is a branch + PR, merged when its CI is green; merging to `main` queues it for the Deploy Manager, which deploys in batches. No direct pushes to `main`.
