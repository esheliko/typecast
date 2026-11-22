---
name: new-project
description: Create a new project with the same work model (rules, hooks, CI, deploy manager, process skill). Use when the owner says "create a project-kit project that does <purpose>" or asks for a new project/app from the kit.
---

# New project from the kit (zero manual steps)

1. Pick a display name and a lowercase-kebab slug from the purpose (ask only if the purpose gives nothing to name it by).
2. Attach the kit repo if it is not in this session: `mcp__claude-code-remote__add_repo` (`owner/project-kit`).
3. Start the workflow: `mcp__github__actions_run_trigger` on the kit repo, workflow `new-project.yml`, ref `main`, inputs `name`, `slug`, `purpose` (and `visibility`/`region` only if the owner named them). Never put secrets in inputs.
4. Read the run with `mcp__github__actions_get` until it finishes (a few minutes; the Supabase project takes the longest). If it fails, read the job log (`get_job_logs`), fix the cause in the kit if it is a kit bug (normal branch + PR flow), otherwise tell the owner the one thing they must do (a missing kit secret). A half-created project (repo exists) needs its leftovers removed before a retry: say which.
5. Attach the new repo (`add_repo`, access `push`) and start the first work session on it: `mcp__claude-code-remote__create_session` with `source_url` of the new repo and a prompt "Read CLAUDE.md and issue #3, then do it." The first task is issue #3.
6. Reply to the owner: link to the repo, the first session, and that the Supabase invite email is in their inbox (set a password there). That is the only thing they have to do.
