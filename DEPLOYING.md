# Deploying Typecast (Deploy Manager)

Vercel Hobby limits deployments, so **a push no longer deploys by itself** (`vercel.json` → `git.deploymentEnabled: false`).
`scripts/deploy-manager.mjs` is the only thing that deploys. It deploys the head of `main` as ONE deployment per burst of pushes.

## How it runs
- **GitHub Actions** (`.github/workflows/deploy-manager.yml`): on every push to `main`, every 5 min, and on demand. Needs the repo
  secret `VERCEL_TOKEN` (Vercel → Account → Tokens, scope: the `eshelikos-projects` team; GitHub → Settings → Secrets → Actions).
  Without it the workflow idles.
- **Claude supervisor** (scheduled task): runs the same script with `--no-poll` as a backup, checks the board is fresh,
  tunes the policy, and reports.
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
