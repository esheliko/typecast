# Deploying {{NAME}} (Deploy Manager)

Vercel Hobby limits deployments, so **a merge to `main` does not deploy by itself** (`vercel.json` -> `git.deploymentEnabled: false`).
`scripts/deploy-manager.mjs` is the only thing that deploys. It deploys the head of `main` as ONE deployment per burst of merges (every change reaches `main` as a squash-merged pull request, never a direct push).

## How it runs
- **GitHub Actions** (`.github/workflows/deploy-manager.yml`): when CI finishes, every 5 min as a safety net, and on demand. Needs the repo secret `VERCEL_TOKEN` (set by the project creator). Without it the workflow idles.
- **No Claude session is involved.** A session may run `STATUS_ISSUE=1 node scripts/deploy-manager.mjs` by hand as a one-off.
- **Board**: issue #1 shows the live commit, open PRs with their `verify` state, commits merged and waiting to deploy, next deploy time, recent deployments and events. Issue #2 is the CI status of `main` (`scripts/ci-status.mjs`). Both are written by scripts: do not edit them.
- **One deployment per sha**: right before the POST the manager re-reads Vercel and refuses if that sha already has a production deployment or another production build is running.

## Policy (see `CFG` in `scripts/deploy-manager.mjs`)
- Wait until `main` has been quiet 3 min, or the oldest pending commit is 10 min old.
- Commits touching only docs, `.claude`, `.github`, `supabase`, `scripts`, `tests` never trigger a deployment (`CFG.noDeploy`).
- `[deploy-now]` in a commit message deploys immediately (real hotfixes only).
- A failed head is not retried until a new commit lands. A real 402 from Vercel backs off 45 min.

## CI gate
`.github/workflows/ci.yml` runs lint (incl. the client/server import check and the rules-sync check), typecheck, unit tests, build and the smoke test as one check named `verify`.
The Deploy Manager reads that check on the head commit before deploying: **pass** deploys, **running** holds (up to 25 min), **failed** blocks and comments on issue #1, keeping the last good version live.
The smoke test is two Playwright projects against one server (`core` writes, `visual` only reads). Locally: `npm run build && npm run smoke`. In a cloud session Node's `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1` (the script and `playwright.config.ts` set it).

### Temporary smoke accounts
With `SUPABASE_SERVICE_ROLE_KEY` set (repo secret, set by the project creator) every Playwright invocation creates its own user `smoke-<random>@example.com`, signs in as it and deletes it in teardown (`tests/smoke/account.ts`). Deletes only ever happen for addresses matching `^smoke-[a-z0-9]{8,}@example\.com$`. Without the key the suite falls back to `SMOKE_EMAIL` / `SMOKE_PASSWORD` (a dedicated account whose email contains `smoke` or `test`; one run at a time).

## For sessions
Nobody pushes to `main`: every change is a branch + pull request, `verify` must be green, then the PR is squash-merged (CLAUDE.md standing rule). A merge queues the change for the Deploy Manager (5-15 min after merges quiet down). Sessions do not deploy, redeploy or touch Vercel deployments.

## Automation board data
`.github/workflows/automation.yml` runs `scripts/automation.mjs` after every CI run and every 30 min (no model, no tokens). It writes ONE issue labelled `automation-data` (created on first run) with open alerts (red main, stale deploy manager, stuck PRs, ...), what runs automatically and statistics. Contract and pure logic: `scripts/automation-core.mjs`.

## Operating the system
- **A red `main`:** `node scripts/ci-status.mjs --sha <sha>` names failing tests and exactly one Owner session; the Owner fixes it (CLAUDE.md rule 7). Re-run CI once before blaming anyone. A red commit already in production is fixed with `[deploy-now]`.
- **Process changes:** requests are issues labelled `process-request`; a process session (`/process`) batches them into one PR; each change is logged in `process/CHANGELOG.md` with an expected effect and review date.
- **Sessions stopped by the usage limit:** in a process session, `list_sessions` (`mine: true`) written to a file, `node scripts/resume-limited.mjs <file>`, check each candidate's last result, message it to continue.

## Database migrations
The owner never applies a migration by hand. `scripts/migrate.mjs` applies every `supabase/migrations/*.sql` not yet in `public.schema_migrations`, in filename order, through the Supabase Management API (one transaction per file with its record row). It stops at the first failure. The Deploy Manager runs it right before it creates a deployment (needs repo secrets `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL`). Sessions: `node scripts/migrate.mjs` (`--status` / `--dry-run` only look). Write migrations re-runnable and additive.

## Status-board state safety
Issue #1's hidden `<!--state-->` JSON holds the deploy history. A failed or unparsable read of it must never lead to a write (`parseStateBody` / `mayWriteState`). A rolling backup comment restores it; with none, deployments are rebuilt from Vercel + git (`--rebuild-state`).

## Process-rule wording
Rules have one source: `process/rules.json`. `npm run rules:build` regenerates the standing-rule blocks in CLAUDE.md and `.claude/hooks/rules-*.txt`; `npm run lint` (so CI) fails if they drift or the always-loaded text goes over `budget.alwaysLoadedTokens`. To change a rule: edit the JSON, build, commit all of it. Never hand-edit the generated parts. History of why things are the way they are: `process/lessons.md`.
