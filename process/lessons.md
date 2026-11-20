# Process lessons log (history)

Dated lessons moved out of DEPLOYING.md on 2026-11-20 so sessions do not read them by default. Read an entry only when you work on that mechanism. Entries that mention the "manager session", the "watcher", the "heartbeat" or the "deploy guard" describe the setup before 2026-11-20, when the Claude-session watching was replaced by GitHub Actions (see DEPLOYING.md > Automation board data).

## Deploy pacing and CI gate
- 2026-11-08: ~45 deployments in 5h from parallel sessions pushing one by one; Vercel then refused all deployments.
  The Vercel list API caps at 100 per page, so "100 in 24h" was really 150+. The block lifted early (a manual API deployment
  was accepted ~2h after the last one), so the 24h count is a pacing signal, not an exact quota. Only a real 402 is a hard stop.

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
