# Project kit: create a project that works the way Typecast works

A GitHub *template repository* holding the Typecast work model (standing rules, reply tags, hooks, `process/rules.json`, CI `verify`, Deploy Manager, automation board, process skill) on a blank Next.js 16 + Supabase + Vercel app. Say "create a project-kit project that does X" and a session creates the repo, Supabase project, Vercel project, secrets, first issues and first commit, then starts working on the purpose.

## What is in this folder
- `template/`: the kit itself (this is what lives in the `project-kit` repo). `{{PLACEHOLDERS}}` are filled at creation.
- `tools/build-kit.mjs`: copies the live process files from this repo into `template/` (so the kit follows how you tweak the work model). `--check` lists drift.
- `tools/instantiate-local.mjs`: fills a copy of the template with fake ids (no network); used to check the kit still installs, lints, typechecks, tests and builds.

## One-time setup (done once, then never again)
1. Create the GitHub repo `esheliko/project-kit`, tick **Template repository** (Settings > General), and push the contents of `template/` to `main`. (A session can do the push once the repo exists and is attached.)
2. In that repo add Actions secrets: `KIT_GH_TOKEN` (fine-grained PAT, all repositories: Administration, Contents, Workflows, Secrets, Issues = read/write; or a classic PAT with `repo` + `workflow`), `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`, `KIT_OWNER_EMAIL` (the address that is invited to each new project).

## Every new project
Tell any session: "create a project-kit project that does <purpose>". It runs the `new-project` workflow, attaches the new repo and starts the first task (issue #3). The only thing you do is set a password from the Supabase invite email.

## Keeping the kit current
After a process change merges here, run `node docs/project-kit/tools/build-kit.mjs`, then push `template/` to the kit repo. Hand-written kit files (CLAUDE.md, DEPLOYING.md, app shell, bootstrap) are not overwritten: update them by hand when the live ones change in a way that applies to every project.

## Status
Verified here: the generated project installs, lints, typechecks, passes 71 unit tests, builds and passes the signed-out smoke tests; `bootstrap.mjs --dry-run` walks every step. NOT yet run against the real GitHub, Supabase and Vercel APIs: the first real run is the test, expect to fix a request shape.
