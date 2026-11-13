# Deploying Typecast (Deploy Manager)

Vercel Hobby limits deployments, so **a merge to `main` no longer deploys by itself** (`vercel.json` → `git.deploymentEnabled: false`).
`scripts/deploy-manager.mjs` is the only thing that deploys. It deploys the head of `main` as ONE deployment per burst of merges (every change reaches `main` as a squash-merged pull request, never a direct push).

## How it runs
- **GitHub Actions** (`.github/workflows/deploy-manager.yml`): when CI finishes (`workflow_run`, cancelled CI runs are ignored), every 5 min as a safety net, and on demand (no `push` trigger since 2026-11-09: it only started runs that the next push cancelled). Needs the repo
  secret `VERCEL_TOKEN` (Vercel → Account → Tokens, scope: the `eshelikos-projects` team; GitHub → Settings → Secrets → Actions).
  Without it the workflow idles.
- **No Claude supervisor any more** (deleted 2026-11-09, see lessons). Actions is the only automatic executor. A Claude session can still run
  `STATUS_ISSUE=1 node scripts/deploy-manager.mjs` by hand as a one-off (Vercel auth is proxy-injected there).
- **Board**: issue #1 shows live commit, a Pipeline section (open PRs with their `verify` state and whether they can merge now, merged-but-not-live count, recent branches that have no PR yet), commits merged to `main` waiting to deploy, next deploy time, recent deployments and events. PR/branch data is read from GitHub at most every 2 min and fails soft (the board then says it is unavailable and the main-only part stays correct). Deploy decisions still look only at `main`: a PR or branch never deploys until it is merged.

- **One deployment per sha**: right before the POST the manager re-reads Vercel and refuses (`deployRefusal`) if that sha already has a production deployment (live or in flight) or another production build is running. Two executors (Actions + the manager-watch guard) used to decide from lists read earlier and both deployed (2026-11-13: c52b683 twice, 37 s apart).

## Policy (see `CFG` in the script)
- Wait until `main` has been quiet 3 min, or the oldest pending commit is 10 min old (slower tiers when the 24h count is high).
- Commits touching only docs/`.claude`/`.github`/`supabase`/`artifact.html` never trigger a deployment.
- `[deploy-now]` in a commit message deploys immediately (real hotfixes only).
- A failed head is not retried until a new commit lands. A real 402 from Vercel backs off 45 min.

## CI gate
`.github/workflows/ci.yml` runs lint (incl. the client/server import check), typecheck, unit tests, build and the smoke test as one check named `verify`.
The smoke test is two Playwright projects against one server, run concurrently: `core` (behaviour + smoke; they write to the one shared test user, so they stay on a single worker) and `visual` (read-only, started with `SMOKE_SKIP_SETUP=1` so it never seeds or cleans up under `core`). Locally `npm run smoke` (`scripts/smoke.mjs`) now does the same as CI: one server, both projects at once (it used to run them one after the other: the sum, 6+ min). Signed-in tests reuse one login saved by global setup (`tests/smoke/auth.ts`, `.smoke-auth/`) instead of typing the password ~30 times. In a cloud session Node's `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1` (the script and `playwright.config.ts` set it); without it every TMDB call fails and each test burns its timeouts (10+ min). Also there, the browser cannot load `image.tmdb.org`, so `visual` fails on "images did not load" and is slow: judge `visual` in CI, not in a cloud session. `npm run smoke -- -g <name>` runs plain `playwright test` with those args. A leftover `next start` on port 3100 gets reused by the next run: kill it first. Anything new that WRITES to the test user belongs in `core` (in shared-account fallback mode only; see below); the Playwright browser cache is keyed on the Playwright version, not the lockfile.
The Deploy Manager reads that check on the head commit before deploying: **pass** (or no check at all) deploys, **running** holds (up to 25 min, then
deploys anyway so a stuck CI cannot freeze releases), **failed** blocks, comments on issue #1 once and keeps the last good version live. A new commit re-runs it.
`[deploy-now]` skips the gate (real hotfixes only).

## Smoke test setup (one-off)
The signed-in half of the smoke test needs a dedicated account, never a real one (its email must contain `smoke` or `test`; the test refuses otherwise and only
deletes the rows it seeded). Create it in Supabase (Auth > Users, or sign up through `/login` if allowed; add it to `ALLOWED_EMAILS` if that is enforced), then add
GitHub repo secrets: `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TMDB_TOKEN`.
Without them CI still runs everything else and the signed-out pages, and prints a warning. Locally: set the same variables, `npm run build && npm run smoke`.

### Temporary smoke accounts (no shared test user)
With `SUPABASE_SERVICE_ROLE_KEY` set (GitHub repo secret; the same value the app uses in Vercel), every Playwright invocation creates its own user `smoke-<random>@example.com` (admin API, email confirmed, random password) in global setup, seeds it, signs in as it, and deletes it in teardown (library, profile and import rows cascade). Nothing is shared, so any number of runs (CI, sessions, `core` beside `visual`) can go at once and nobody maintains a smoke account. Code: `tests/smoke/account.ts` (rules in `account-rules.ts`, unit tested). Safety: the key can touch every user, so deletes only ever happen for addresses matching `^smoke-[a-z0-9]{8,}@example\.com$` (checked again right before each delete); a run killed before teardown leaves one such user, and the next run's sweep removes smoke accounts older than 2 h.
Without the key the suite falls back to the shared `SMOKE_EMAIL`/`SMOKE_PASSWORD` account and the old rules apply (one run at a time; `visual` is started with `SMOKE_SKIP_SETUP=1`; never run a local smoke while CI runs on main). Cloud sessions do not have the key, so they use that fallback.

## For sessions
Since 2026-11-12 nobody pushes to `main` directly: every change is a branch + pull request, `verify` must be green on the PR, then the PR is squash-merged (CLAUDE.md standing rule).
A merge is what queues a change for the Deploy Manager; it still batches merges into one deployment (5-15 min after merges quiet down, `[deploy-now]` in the squash commit message for a real hotfix).
Sessions do not deploy, redeploy or touch Vercel deployments, and check issue #1 only if they need to know what is live. Because a PR's `verify` has already passed before it reaches `main`,
the "batch can ship before its own CI finishes" case in the section below is now rare: it only applies to `[deploy-now]` hotfixes and to a merge whose push CI on `main` is still running. The push CI on `main` still runs after each merge
and still feeds issue #2 and the Owner mechanism.

## Lessons log
- 2026-11-08: ~45 deployments in 5h from parallel sessions pushing one by one; Vercel then refused all deployments.
  The Vercel list API caps at 100 per page, so "100 in 24h" was really 150+. The block lifted early (a manual API deployment
  was accepted ~2h after the last one), so the 24h count is a pacing signal, not an exact quota. Only a real 402 is a hard stop.

## Visual board (Claude artifact "Typecast deploy board")
https://claude.ai/artifact/UbFWzbLxByvYjzki19uuMv. Fully live, no uploads: every panel is a live query. Vercel connector (`list_deployments`) gives the live commit,
the 24h/1h counts, the hourly chart and "Shipped to production"; GitHub connector (`list_commits` on main, `issue_read` on issue #1) gives "Waiting to deploy"
(commits newer than the live one, minus ones the manager ignores) and the manager status, deployments table and events. The page re-checks every 10 s while open.
Each viewer must approve both connectors (Vercel for team `eshelikos-projects`; GitHub = a custom connector, `https://api.githubcopilot.com/mcp/`, via an OAuth app).
The supervisor has nothing to refresh there. `scripts/dashboard-data.mjs` is gone. **Updated for the PR flow (2026-11-13):** a Pipeline card (open PRs with CI state, merged-but-not-live count, branches with no PR) is parsed from the Pipeline section of issue #1, "Waiting to deploy" is now "Merged, waiting to deploy", and a "How a change ships" card restates the branch + PR + green `verify` + batched deploy rules. If the issue's Pipeline format in `renderPipeline` changes, update the `pipeline*` calcs in the artifact.
**Commit markers (2026-11-13):** every commit row on the board carries 🔵 (affects production), ⚪ (no production effect: docs, scripts, tests, CI, `.claude`, supabase) or ❓ (unclear: no file list). Never red. They come from `commitMarker` in `deploy-manager.mjs`, which uses the same `CFG.noDeploy` rule that decides what the manager deploys; the manager writes a `### Commit markers` section (last 40 commits on main) into issue #1 and a `mix` string per deployment ("1 production change, 11 no-effect") into its state. The artifact's `markers` calc parses those lines; if `renderMarkers` changes, update that calc. Commits older than the 40 shown get ❓.
**PR markers and loose branches (2026-11-13):** the PR table has a `change` column with the same 🔵/⚪/❓ marker, from the PR's files via `commitMarker` (a PR touching both site and non-site files is 🔵; files unreadable = ❓). Branches are split by `branchKind`/`inMainState`/`tipCoveredByPr`: a branch is **loose** only if it is ahead of main, has **no PR in any state** (`pulls?state=all`), its tip commit is not inside a merged/open PR, and its files are not already identical on main; loose ones show commits, files, `already in main: no|partly` and age. Branches of merged PRs are only a count ("N merged branches not deleted": this repo squash-merges, so they stay "ahead" forever and sessions cannot delete remote branches). Contract: `pipelinePr` (now with a marker cell), `pipelineBranch`, `pipelineMergedLeft`, `pipelineInMainLeft`.
**Who refreshes the board / staleness:** nobody has to. Its data panels are live queries run in the viewer's browser on every open (Vercel + GitHub connectors), so the "last updated" date of the artifact page (2026-11-08) is only when its dataset definitions were last edited, not data age. What CAN go stale is the page code when the issue #1 format changes (it parses the issue text): whoever changes `render`/`renderPipeline`/`renderMarkers` must update the artifact in the same task (via the `ArtifactData` tool on its `files/index.html`, not by publishing a file) and say so in the PR.
- 2026-11-08: first push-triggered Actions tick confirmed (board tick #3 with no Claude run). Anything under `scripts/` is now deploy-neutral too.
- 2026-11-08 (17:50 IST): 7 commits waited 40+ min. Two causes: (1) the CI gate treated a cancelled `verify` on the head as "pending" and held up to 25 min,
  though a cancelled run with nothing after it never finishes: now it stops blocking after 3 min; (2) the slow pacing tier (10 min quiet / 60 min max wait)
  was triggered by the 24h count, which Vercel does not enforce: the slowest tier is now 4 min quiet / 15 min max wait.
- 2026-11-08 (owner suggestion): relevance is now judged on the NET diff between the live commit and main, not commit by commit. Docs/scripts/tests/CI
  never count, and an edit followed by its revert counts as nothing, so the manager waits for a change that actually alters the site. Unknown files still
  count as site files (safe default).
- 2026-11-09 (08:55 IST): deleted the hourly Claude supervisor. Scheduled sessions start with no GitHub access (no repo attached, `gh` token invalid, no `add_repo`
  tool), so it could neither read issue #1 nor monitor anything, and pushed an hourly complaint instead. Actions has been the real executor all along (ticks #15-#32
  and every deployment since 15:50 IST yesterday). Known gap: nothing alerts if Actions itself stops; the board's 'Last tick' is the only sign.
- 2026-11-09 (09:30 IST): `1c3788e` waited 333 min. Cause: while CI was still running the manager held and EXITED, relying on the next 5-min cron tick, and GitHub's
  schedule is unreliable (17 ticks in 11.5h, a 5h gap). Now the run keeps polling while CI runs (up to 24 min), and a `workflow_run` trigger runs the manager as soon
  as CI completes. Never rely on the cron for latency: it is only a safety net.
- 2026-11-09 (13:45 IST): review of the first day. (1) CI (`verify`) had been red on nearly every run since the previous evening (4 smoke tests), and releases only went out
  because of a race: a just-pushed head has no `verify` check yet, which the gate read as "CI never ran". Now a head younger than 4 min with no check holds (CI is about to
  start). (2) A permanently red main must not freeze releases: if the LIVE commit's `verify` is red too, a red head no longer blocks; the manager deploys, says so on the
  board and comments once. A red head after a green live commit still blocks. (3) The smoke failures themselves belong to the feature sessions: popup mark vs poster,
  new-episode badge, note saved before leaving, Watching-now bar.
- 2026-11-09 (owner request): failing tests must be fixed by whoever broke them. Mechanism: (1) `scripts/ci-status.mjs` reads the failing tests from the `verify` check, finds
  the last green commit and ranks the commits since by overlap with the failing tests; the `Claude-Session:` trailer on each commit names the responsible session.
  (2) The Deploy Manager runs it whenever CI finishes and keeps issue #2 current; it comments once when main turns red and once when it is green again.
  (3) CLAUDE.md rule 6 (now rule 7, after a merge instead of a push): every session runs `node scripts/ci-status.mjs --wait` after pushing and fixes its own red; the start hook prints a red main to every new
  session. (4) Claude sessions can also be messaged directly (send_message) with the failing tests when the owner asks. Why attribution is fuzzy: CI cancels
  in-progress runs, so in a burst of pushes most commits never get their own verdict (2026-11-08 20:00: ~25 pushes, one verdict).
- 2026-11-09 (19:55 IST): the first red after the ownership mechanism showed the loophole: two sessions both wrote the red off as the other's. Now `ci-status.mjs` always names
  exactly ONE Owner (best match with the failing tests, else the first push after the last green commit) and rule 6 says the Owner fixes it even if a neighbour caused it.
  Delivery: GitHub Actions cannot reach Claude, so a Claude session runs `node scripts/ci-watch.mjs` under the Monitor tool and messages the Owner (send_message) the moment a
  new red appears (a reminder every 45 min while red). If no watcher session is alive, the rule, the start hook and issue #2 are the only nudges: re-arm the watcher.
- 2026-11-09 (owner request): every session starts a background CI wait after each push. `scripts/ci-status.mjs --wait --for <sha>` blocks until the first finished verdict on that
  commit or any later main commit (cancelled runs are skipped), then prints the verdict and a `>>>` line saying whether this session is the Owner. Background Bash tasks wake the
  session that started them when they end, so the session is told even after it stopped talking. The rule is CLAUDE.md 6 and the start hook repeats it.
- 2026-11-09 (19:55 IST): bug found and fixed: the session-start hook exited at its first line since 542cd46 (my edit put the CI block after the first `exit 0`), so new sessions saw
  no standing rule and no red-CI alert for about six hours. Lesson: after editing the hook, run it and read its output.
- 2026-11-09 (evening): efficiency pass. Dropped the `push` trigger and made cancelled CI runs skip the manager (20 of 27 runs since noon were cancelled). CI caches the Playwright browser and `.next/cache`. CLAUDE.md lost ~40% (per-feature notes moved to `docs/features/`). Rule 3 is now lint + typecheck + unit tests, build only for config/route changes; push once per change set.
- 2026-11-11 (17:50 IST, owner: "you should never be late"): a commit pushed at 17:36 was still waiting at 17:46. Cause: since the push trigger was removed the manager only woke when a CI run
  COMPLETED, and during a burst each push cancels the previous CI, so no run completed and no manager run started; the CI hold was also measured from the NEWEST commit, so every push reset it.
  Fixes: (1) the manager starts on CI `requested` too and stays alive polling until it deploys; (2) the CI hold is capped at 12 min from the OLDEST pending commit. Guarantee: a change is live
  at most ~12 min after it was pushed, unless CI has shown the head red (then the owner is told). Trade-off: a commit can go live while its CI is still running; a red verdict afterwards
  goes to the owner as usual. Never rely on the cron.
- 2026-11-11 (18:50 IST): after the 12-min cap fix, deploys were on time but eight commits in a row got NO CI verdict (each push cancelled the previous run), so a red main would have gone unnoticed
  for the whole burst. CI no longer cancels a running push run on main (`cancel-in-progress` only for non-push events): the running one finishes, the newest queued one waits, older queued ones are
  dropped, so a verdict lands about every 10 min even in a burst and runs stay serialized for the shared smoke account.
- 2026-11-11 (22:45 IST, owner: "why are you late again"): three commits waited 24+ min. GitHub Actions stopped starting jobs for about 25 min (CI and Deploy Manager runs sat in `queued`), so the
  12-min cap never ran: the manager lived entirely on GitHub starting a run. Fix: a second, independent executor. A Claude session that is alive runs `node scripts/deploy-manager.mjs --no-poll`
  every 2 min under the Monitor tool (the "deploy guard"; it prints only when it deploys). The script is idempotent (it checks in-flight deployments and keeps a 2-min minimum gap), so two executors
  cannot double-deploy. Limit: the guard exists only while that Claude session lives; re-arm it when its Monitor expires, and treat "Last tick" on issue #1 older than ~15 min with pending commits as an alarm.

### A red commit can reach production (2026-11-12, f82fca3)
The CI gate waits for `verify` only up to `ciMaxWaitMin` (12 min) and smoke takes 10-25 min, so a batch can ship before its own CI result. When that happens and `verify`
turns red, the manager now posts a 🚨 comment on issue #2 ("the red commit is in production", once per red head) and the owner ships the fix with `[deploy-now]`.

### Intermittent smoke reds (2026-11-12)
The Library smoke tests ('Library shows the seeded titles', 'Library stats') went red on four different commits and green again with no fix; a verify session also saw plain main fail the
popup Watched test 2 of 3 times. Suspects: TMDB errors from the runner (Library titles and 'Top genres' come from TMDB) and the shared smoke user used by overlapping runs.
Rule for whoever sees such a red first: re-run CI on the same commit before blaming anyone; if it goes green with no change it is a flake and the OWNER of the flake (the smoke-infra session) fixes the suite, not the pusher.
`Claude-Session:` trailers are typed by the sessions and can be wrong (a mistyped id sent a red alert nowhere, twice): match the owner by commit and session title when send_message says the id is invalid.
Found cause (smoke-speed session): every smoke run, in CI or in a cloud session, seeds the one smoke user in global setup and DELETES its rows in teardown. A local `npm run smoke` that overlaps a CI run therefore empties the library under it (the failing page snapshot shows an empty library with only suggestions: "Watch next" offering Se7en; the export test says "missing The Matrix"). CI serializes its own runs but cannot see a session's local run. Do not run `npm run smoke` in a cloud session while a CI run on main is in progress (`node scripts/ci-status.mjs`), and expect a red from that overlap to go green on re-run.

### Branch + PR workflow (2026-11-12, owner request)
Replaced "every session pushes straight to main". Why: a red or half-tested change could land on `main` and be deployed before its CI finished. Now `verify` runs on the PR first (`ci.yml` already triggers on `pull_request`, cancelling superseded runs),
and only a green PR is merged. The Deploy Manager itself is unchanged: it still reads `main`'s head and its `verify`, and still batches. Watch for: (1) more, smaller commits on `main` (one squash commit per PR), so `main` may be quiet less often and the 12-min cap matters more;
(2) each PR push costs one CI run and each merge one more on `main`, so keep changes to one push per PR; (3) PR runs of different PRs can overlap, which is safe with `SUPABASE_SERVICE_ROLE_KEY` (temporary accounts) but not on the shared smoke account fallback.

## manager-watch (one quiet watcher for the manager, 2026-11-13)
Replaces the two Monitors (ci-watch + the deploy-guard loop), which each expired every 30 min and woke the manager about 3 times per 30 min. Run it ONCE as a Bash command with `run_in_background: true` and `timeout: 7200000`:

`node scripts/manager-watch.mjs`

It prints nothing while main is green and runs the deploy guard (`git fetch`, then `deploy-manager.mjs --no-poll`, every 120 s) in the same process. It ends with exactly one stdout line, which wakes the manager:
- `CI_RED <sha> owner=<session> tests=N :: names` (exit 0): main's `verify` is red. Run `node scripts/ci-status.mjs --sha <sha>`, triage, then start it again.
- `REARM manager-watch (no red, N guard ticks, M deploys)` (exit 0): 115 min passed with no red. Start it again (before the 2 h timeout would kill it silently).
- `WATCH_ERROR <reason>` (exit 1): CI or the deploy manager could not be read for over 10 min in a row. Silence never means broken: look at it, then start it again.

Deploys the guard triggers are NOT printed; they go to `$TMPDIR/manager-watch.log` as `GUARD_DEPLOYED <HH:MM> IST :: DEPLOYING ...` (the notifier session reports deploys to the owner). A worker restart kills it silently, so re-arm it after every restart. It kills its children on exit and never prints the same red twice, also across restarts (last reported red sha in `$TMPDIR/manager-watch-red`; a new red is still reported). `ci-watch.mjs` stays (its helpers are shared) for ad-hoc use.

## Manager succession (owner decisions, 2026-11-13)
The manager session may RETIRE and create its successor whenever that is cheaper in tokens (long context, ~300k+ tokens, or 2-3 worker restarts that rewrite the cache). To retire: `create_session` for the successor with a SHORT handoff note (state, session ids, open items, and this section), make sure the successor opens the deploy board artifact for the owner (`Artifact` action `open`, https://claude.ai/artifact/UbFWzbLxByvYjzki19uuMv; never rewrite it), tell the notifier and smoke sessions the new manager id, tell the owner in one line, `TaskStop` your own monitors, then stop. **Naming rule (owner decision, 2026-11-13), for the manager AND the deploy-notifications session**: read your current title with `get_session`, then rename yourself with `mcp__claude-code-remote__set_session_title` to `💀 (retired) <exact current title>` (prefix at the very start, nothing else changed), and create the successor with the exact previous title (no "💀 (retired)", no suffix: pass it as `title` in `create_session`, then check it with `get_session`). So there is always exactly one live session per role name, found by its exact title in `list_sessions`; a title starting with `(retired)` is never the live one. A successor of a successor drops the prefix too: the retired session keeps `(retired) <name>` and the new one is `<name>`.

**Seniority state line (owner decision, 2026-11-13), for the manager AND the deploy-notifications session** (any continuous session that may retire): end EVERY response with one short line `Seniority: ctx ~210k/300k · restarts 1/3 · age 5h` so the owner sees how close you are to retiring. Metrics and the threshold at which you retire (the same numbers as above): context size in tokens (retire at ~300k), worker restarts since the last cache rewrite (retire at 2-3), and session age in hours (no hard limit; shown for context). Show the current value next to each threshold; take the real context size from your usage figure, never guess it, and write `?` for a value you cannot read. When any metric reaches its threshold, say so on that line (`ctx 310k/300k RETIRE`) and start the retire steps above in the same response. Put this line rule into every handoff note too.

**No compaction (owner decision, 2026-11-13).** Manager sessions are NOT allowed to be compacted. If a manager session notices its context was compacted (a summary starts the conversation), it must retire immediately: create the successor via `create_session` with a short handoff note, ensure it opens the board, tell the notifier/smoke sessions, tell the owner in one line, stop its own background tasks. This is in addition to the ~300k / 3-restart rule and needs no owner approval.

Already decided by the owner, do NOT ask again:
- **Two watchers are the manager's job**, each a Monitor with `timeout_ms` 1800000: re-arm on every expiry and after every worker restart (that kills them silently). (a) `node scripts/ci-watch.mjs` (CI_RED / CI_GREEN; one CI_GREEN at every start is normal). (b) The deploy guard loop: `while true; do git fetch -q origin main; STATUS_ISSUE=1 node scripts/deploy-manager.mjs --no-poll | grep 'DEPLOYING '; sleep 120; done` (backup deployer, GitHub Actions ticks are unreliable). The auto-mode permission check may block (b) as a "Production Deploy" on the first try: the owner approved running it ("Yes, run the deploy guard", 2026-11-13), so say so in one line and ask the owner to allow it once; do not work around the block.
- **No hourly scheduled Claude task** as a dead-watcher safety net: the owner declined it (2026-11-13). Do not propose it again.
- **Peer sessions**: message them with `mcp__claude-code-remote__send_message` and the session id; the local `SendMessage` cannot reach cloud sessions. Notifier = the session titled exactly "Deploy notifications watcher" (ignore any "💀 (retired) Deploy notifications watcher"; find its current id with `list_sessions`: it replaces itself for token cost and tells the manager each new id; last known `session_01VHHsodiiStgkzdnn6ZR5mf`; it tells the owner when a deploy goes live; check it with `get_session` every 30-60 min, it must have a running watcher); smoke = `session_01VHHsobRc19Bg6dxafYrkKB` (owns smoke-suite reliability).
- **On CI_RED**: `node scripts/ci-status.mjs --sha <sha>`; decide flake vs real first and re-run once before blaming anyone; then message the Owner session (find the real session by commit + title if its id is invalid) and tell the owner when a red commit is live.
- **Reporting**: every message to the owner starts with the reply-format tag from CLAUDE.md (`🔴 NEEDS YOU:` / `🟢 DONE:` / `⚙️ AUTO:`); a real problem or question for the owner is always `🔴` with the ask first, restated in full even if you already raised it, and every watcher/wake turn that changes nothing for the owner is a 1-2 line `⚙️ AUTO`. Messages are short and plain, times in Israel time (`TZ=Asia/Jerusalem date`), ending with `*Last action: YYYY-MM-DD HH:MM IST*`. A fuller report roughly every 3-4 hours or on a real incident: deploy count, median commit-to-live, reds and causes, watcher gaps, mechanism changes, lessons.
- Every repo change is a branch + ONE PR merged when `verify` is green (CLAUDE.md). Take the `Claude-Session:` trailer from `get_session`, never from memory.
- Ignore the two unused-variable lint warnings (`PositionControl.tsx` 'unsure', `person/[id]/page.tsx` 'searchParams') unless asked.

### Standing duty for the manager AND the deploy-notifications session (owner decision, 2026-11-13)
However many times either session is replaced, every incarnation must stay critical of its own work and of the mechanisms of this project (Deploy Manager, CI gate, smoke suite, watchers, notifications, this doc), learn from every mistake and problem that comes up, and keep improving them as well as it can. Concretely:
- After each incident, near miss or own mistake (missed or late alert, dead watcher, wrong owner routed, flake blamed on the wrong person, a deploy that was late or early, a step that needed the owner), ask what in the mechanism allowed it and fix the mechanism, not just the instance: a script change, a clearer rule, or a lesson here, all through a branch + PR.
- Do not assume the current design is right because it exists. Look for what is slow, noisy, fragile or costs tokens, and propose or make the improvement; report honestly to the owner what you changed and what is still weak, including your own errors.
- Roles (owner decision, 2026-11-13): the **manager is the single accountable entity**. Every session (notifier, smoke, feature sessions) reports issues to the manager; the manager decides the solution, consults the owner when needed, and **creates a worker session (`create_session`) to execute every systemic change** (scripts, docs, PRs, CI fixes) so the manager's own context stays small. The manager itself does not edit the repo or open PRs: it runs the watchers, triages, briefs the worker (short, self-contained: goal, files, branch + PR + `verify` rules from CLAUDE.md, the Claude-Session trailer rule, report back when merged), checks the result, and reports to the owner. The deploy-notifications session takes no repo action either: it reports every problem or weakness it notices to the manager. Both must still be critical of their own work (missed, late, noisy or wrong notices; slow or fragile mechanisms) and say so.
  - The no-change rule covers artifacts too: the manager and the deploy-notifications session never edit, publish or republish any artifact (the deploy board included); they may only open/view it for the owner. Worker sessions make the artifact changes.
  - Worker (child) session naming and brief (owner decision, 2026-11-13): every worker session the manager or the notifier opens with `create_session` is titled `<asker emoji><space>` + `👷‍♂️` + `<space><short topic>`, where the asker emoji is the emoji of the session that asked for the change: `🚀` when the deploy manager asked, `🔔` when the deploy-notifications session asked, and nothing when a regular session asked (the title then starts with `👷‍♂️`). Example: `🚀 👷‍♂️ fix ci-status wait`. The FIRST paragraph of the worker's brief is a link to the session that asked for the change (`https://claude.ai/code/<session id>`, the asking session, not necessarily the one creating the worker), so the worker and the owner can always trace who wanted it. Check the title with `get_session` after creating.
- Anything the owner has already decided stays decided (see Manager succession); otherwise do not wait to be asked to improve things.
- Put this duty verbatim into every handoff note you write for a successor, and make sure the other session's note carries it too.
- Put the naming rule (Manager succession: rename yourself `💀 (retired) <title>`, successor gets the exact previous title) into every handoff note too, and make sure the notifier follows it when it replaces itself.
- Put the no-compaction rule (Manager succession: a compacted manager session retires immediately, no owner approval) into every handoff note too.

### Status-board state safety (2026-11-13)
Issue #1's hidden `<!--state-->` JSON holds the deploy history. A failed or unparsable read of it must never lead to a write (a blank state once replaced 454 ticks and ~60 deployments): the tick is skipped instead (`parseStateBody` / `mayWriteState`). A rolling backup (comment on issue #1, `<!--state-backup-->`, refreshed at most every 30 min) restores it if the marker is genuinely gone; with no backup the deployments are rebuilt from Vercel + git (`rebuildDeploys`). Backfill by hand: `node scripts/deploy-manager.mjs --issue 1 --no-deploy --rebuild-state --no-poll` (`--no-deploy` can never create a deployment).

## Database migrations (2026-11-13)
The owner never applies a migration by hand. `scripts/migrate.mjs` applies every `supabase/migrations/*.sql` not yet listed in `public.schema_migrations`, in filename order, through the Supabase Management API (one request, so one transaction, per file together with its record row). It stops at the first failure and prints the SQL error.
- **When it runs:** the Deploy Manager runs it right before it creates a deployment (CI never holds the database token). Needs repo secrets `SUPABASE_ACCESS_TOKEN` (Supabase account access token) and `NEXT_PUBLIC_SUPABASE_URL`. A migration that fails blocks that deploy; the manager posts a warning on issue #1 and retries each tick. Without the token the step is skipped, except when the batch touches `supabase/migrations/`: then the deploy is blocked and the alert names the missing secret.
- **Sessions:** `node scripts/migrate.mjs` (Claude sessions need nothing: the proxy injects the token), `--status` or `--dry-run` only look. Write migrations re-runnable and additive (the old code keeps running until the deploy lands). A migration-only merge is not deployed by itself (`supabase/` is a no-deploy path), so it is applied with the next deploy, or run the script.
- **First run baseline:** with no record table the script looks at the database: tables exist and `profiles.calendar_token` (0009) is there, so 0001..0009 are recorded without running (0010 as well if `library_items.stopped_min` exists). An empty database runs everything. If it cannot tell, it stops and asks for `--baseline-through NNNN`.
- Exit codes: 0 ok, 1 a migration failed, 2 cannot run (no token or URL). Secrets are never printed.
