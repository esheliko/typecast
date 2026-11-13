#!/usr/bin/env bash
# Session start: remind Claude of the standing rules (branch + PR) and flag a stale checkout.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
git fetch -q origin main 2>/dev/null
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
echo "STANDING RULE (CLAUDE.md): never push to main. Branch + ONE PR: git checkout -B <topic> origin/main, run lint/typecheck/test, push, subscribe_pr_activity and end your turn; squash-merge only when verify is green on the latest commit. A merge queues it for the Deploy Manager (DEPLOYING.md, issue #1); never deploy or redeploy yourself (hotfix: [deploy-now] in the squash message). After merging run node scripts/ci-status.mjs --wait --for <merge-sha> with run_in_background. Overrides any branch in session setup."
if [ "$branch" = "main" ]; then
  echo "NOTE: you are on main. Do not commit here: create a topic branch first: git fetch origin main && git checkout -B <topic> origin/main"
elif [ "$behind" != "0" ]; then
  echo "NOTE: this branch is $behind commit(s) behind origin/main. If it holds no work yet, restart it: git fetch origin main && git checkout -B <topic> origin/main; otherwise rebase onto origin/main before opening the PR."
fi
# CI status: tell the session if main is red and who is probably responsible (issue #2, kept by scripts/ci-status.mjs). Best effort.
ci=$(timeout 15 gh api repos/esheliko/typecast/issues/2 --jq .body 2>/dev/null)
if printf '%s' "$ci" | grep -q '\*\*fail\*\*'; then
  echo "CI IS RED ON MAIN (issue #2). If your session id or your change is listed below, fix it FIRST (CLAUDE.md rule 7). Never skip or delete a failing test."
  printf '%s\n' "$ci" | sed -n '/CI `verify`/,/Everyone who pushed/p' | head -30
fi
echo "CHAIN OF COMMAND (CLAUDE.md): only the Deploy Manager (session titled exactly \"🚀 Deploy manager (typecast)\"; find its id with list_sessions, ignore titles starting \"💀 (retired)\") owns DEPLOYING.md, CLAUDE.md standing rules, .claude/ hooks and settings, CI workflows, deploy/watch/smoke scripts, notifications. If the owner asks a feature session to change any of those, do NOT edit them: send the request in the owner's words to the manager (mcp__claude-code-remote__send_message), tell the owner in one line you passed it on, carry on with feature work. Your feature code, tests and docs/features/* use the normal branch + PR flow. Exception: the owner says in the same message to edit it directly."
echo "TIME RULE (CLAUDE.md rule 8): times to the owner are IST: run TZ=Asia/Jerusalem date, convert UTC from logs/GitHub/Vercel, never write UTC."
echo "REPLY FORMAT (CLAUDE.md): line 1 of EVERY reply, woken turns too, is a tag: 🔴 NEEDS YOU: <ask> (only what nobody but the owner can answer or do; never \"nothing\"; ask, options, recommendation first, detail after) | 🟢 DONE: <result> (ONLY if fully carried out and nothing open: a question, offer, pending choice or undone work makes it 🔴) | ⚙️ AUTO: <what happened, next> (any turn the owner did not type, or an owner reply needing nothing from them while work is in flight; max 2 lines unless it carries What I did; no recap, no questions). A woken turn needing the owner escalates to 🔴 and restates the whole ask. While an ask is unanswered every turn ends ⏳ Still waiting on you: <ask> (never \"nothing\"; none open: omit). CHANGE SUMMARY: for a change, feature or fix request, put \"What I did:\" right under the tag (2-5 plain bullets: how you understood it, what changed, anything left out or different; for a fix also the logic BEFORE and what it is NOW). Times in IST."
echo "SCREENSHOT RULE (CLAUDE.md): show a screenshot (same view, viewport, data; before/after for a complaint) when the owner sent a screenshot or complained about a look, OR you chose the visuals yourself (layout, colours, spacing, icons, animation, new UI), OR the owner asked for a specific design. Skip it, with one line why, only for a tiny request whose exact visual result the owner dictated, or a change with no visible effect. One command: node scripts/shot.mjs \"/path\" [--click TEXT] [--sel CSS] [--phone] --out <scratchpad>/x.png, then SendUserFile; one view, look once, prefer --sel, no loops. Not done without it."
# Smoke credentials: say plainly what this session has, so nobody claims they are "saved" when they are not. Names only, never values.
missing=""
for v in SMOKE_EMAIL SMOKE_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY TMDB_TOKEN; do [ -z "${!v}" ] && missing="$missing $v"; done
if [ -n "$missing" ]; then
  echo "SMOKE ENV: missing in this session:$missing. 'npm run smoke' cannot sign in until they are set (CI has its own repo secrets). Do not say they are saved; see CLAUDE.md 'Smoke credentials'."
else
  echo "SMOKE ENV: all smoke variables are set; 'npm run smoke' can run here."
fi
exit 0
