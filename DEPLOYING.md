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

## For sessions
Commit, run lint/typecheck/build, push to `main`, done. Do not deploy, redeploy, or touch Vercel deployments. Your change goes live
in roughly 5-15 min; check issue #1 if you need to know.

## Lessons log
- 2026-11-08: ~45 deployments in 5h from parallel sessions pushing one by one; Vercel then refused all deployments.
  The Vercel list API caps at 100 per page, so "100 in 24h" was really 150+. The block lifted early (a manual API deployment
  was accepted ~2h after the last one), so the 24h count is a pacing signal, not an exact quota. Only a real 402 is a hard stop.

## Visual board (Claude artifact "Typecast deploy board")
https://claude.ai/artifact/UbFWzbLxByvYjzki19uuMv. It reads five JSON files uploaded to the artifact (no GitHub/Vercel connector exists, so it
cannot query live). Refresh: `node scripts/dashboard-data.mjs <dir>`, then upload each of status/hourly/recent/events .json with the Artifact tool
(`asset: true`, same url) and `update` the matching `datasets/<id>` document's `source.url`, `source.name` and `updated`. The hourly supervisor does this.
