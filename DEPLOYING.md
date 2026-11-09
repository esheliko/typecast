# Deploying Typecast (Deploy Manager)

Vercel Hobby limits deployments, so **a push no longer deploys by itself** (`vercel.json` → `git.deploymentEnabled: false`).
`scripts/deploy-manager.mjs` is the only thing that deploys. It deploys the head of `main` as ONE deployment per burst of pushes.

## How it runs
- **GitHub Actions** (`.github/workflows/deploy-manager.yml`): on every push to `main`, every 5 min, and on demand. Needs the repo
  secret `VERCEL_TOKEN` (Vercel → Account → Tokens, scope: the `eshelikos-projects` team; GitHub → Settings → Secrets → Actions).
  Without it the workflow idles.
- **No Claude supervisor any more** (deleted 2026-11-09, see lessons). Actions is the only automatic executor. A Claude session can still run
  `STATUS_ISSUE=1 node scripts/deploy-manager.mjs` by hand as a one-off (Vercel auth is proxy-injected there).
- **Board**: issue #1 shows live commit, pending commits, next deploy time, recent deployments and events.

## Policy (see `CFG` in the script)
- Wait until `main` has been quiet 3 min, or the oldest pending commit is 10 min old (slower tiers when the 24h count is high).
- Commits touching only docs/`.claude`/`.github`/`supabase`/`artifact.html` never trigger a deployment.
- `[deploy-now]` in a commit message deploys immediately (real hotfixes only).
- A failed head is not retried until a new commit lands. A real 402 from Vercel backs off 45 min.

## CI gate
`.github/workflows/ci.yml` runs lint (incl. the client/server import check), typecheck, unit tests, build and the smoke test as one check named `verify`.
The Deploy Manager reads that check on the head commit before deploying: **pass** (or no check at all) deploys, **running** holds (up to 25 min, then
deploys anyway so a stuck CI cannot freeze releases), **failed** blocks, comments on issue #1 once and keeps the last good version live. A new commit re-runs it.
`[deploy-now]` skips the gate (real hotfixes only).

## Smoke test setup (one-off)
The signed-in half of the smoke test needs a dedicated account, never a real one (its email must contain `smoke` or `test`; the test refuses otherwise and only
deletes the rows it seeded). Create it in Supabase (Auth > Users, or sign up through `/login` if allowed; add it to `ALLOWED_EMAILS` if that is enforced), then add
GitHub repo secrets: `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TMDB_TOKEN`.
Without them CI still runs everything else and the signed-out pages, and prints a warning. Locally: set the same variables, `npm run build && npm run smoke`.

## For sessions
Commit, run lint/typecheck/build, push to `main`, done. Do not deploy, redeploy, or touch Vercel deployments. Your change goes live
in roughly 5-15 min; check issue #1 if you need to know.

## Lessons log
- 2026-11-08: ~45 deployments in 5h from parallel sessions pushing one by one; Vercel then refused all deployments.
  The Vercel list API caps at 100 per page, so "100 in 24h" was really 150+. The block lifted early (a manual API deployment
  was accepted ~2h after the last one), so the 24h count is a pacing signal, not an exact quota. Only a real 402 is a hard stop.

## Visual board (Claude artifact "Typecast deploy board")
https://claude.ai/artifact/UbFWzbLxByvYjzki19uuMv. Fully live, no uploads: every panel is a live query. Vercel connector (`list_deployments`) gives the live commit,
the 24h/1h counts, the hourly chart and "Shipped to production"; GitHub connector (`list_commits` on main, `issue_read` on issue #1) gives "Waiting to deploy"
(commits newer than the live one, minus ones the manager ignores) and the manager status, deployments table and events. The page re-checks every 10 s while open.
Each viewer must approve both connectors (Vercel for team `eshelikos-projects`; GitHub = a custom connector, `https://api.githubcopilot.com/mcp/`, via an OAuth app).
The supervisor has nothing to refresh there. `scripts/dashboard-data.mjs` is gone.
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
  (3) CLAUDE.md rule 6: every session runs `node scripts/ci-status.mjs --wait` after pushing and fixes its own red; the start hook prints a red main to every new
  session. (4) Claude sessions can also be messaged directly (send_message) with the failing tests when the owner asks. Why attribution is fuzzy: CI cancels
  in-progress runs, so in a burst of pushes most commits never get their own verdict (2026-11-08 20:00: ~25 pushes, one verdict).
- 2026-11-09 (19:55 IST): the first red after the ownership mechanism showed the loophole: two sessions both wrote the red off as the other's. Now `ci-status.mjs` always names
  exactly ONE Owner (best match with the failing tests, else the first push after the last green commit) and rule 6 says the Owner fixes it even if a neighbour caused it.
  Delivery: GitHub Actions cannot reach Claude, so a Claude session runs `node scripts/ci-watch.mjs` under the Monitor tool and messages the Owner (send_message) the moment a
  new red appears (a reminder every 45 min while red). If no watcher session is alive, the rule, the start hook and issue #2 are the only nudges: re-arm the watcher.
