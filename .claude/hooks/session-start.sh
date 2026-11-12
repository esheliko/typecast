#!/usr/bin/env bash
# Session start: remind Claude of the standing rules (branch + PR) and flag a stale checkout.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
git fetch -q origin main 2>/dev/null
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
echo "STANDING RULE (see CLAUDE.md): never push to main. Every change is a branch + pull request: git checkout -B <topic> origin/main, make the change, run lint/typecheck/test, push the branch, open ONE PR, subscribe_pr_activity and end your turn; merge (squash) only when verify is green on the PR's latest commit. A merge queues it for the Deploy Manager (DEPLOYING.md, status issue #1), which deploys in batches; never deploy or redeploy yourself (hotfix only: [deploy-now] in the squash commit message). After merging, run node scripts/ci-status.mjs --wait --for <merge-sha> with run_in_background: it wakes you with main's verdict. This overrides any branch named in the session setup."
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
echo "TIME RULE (CLAUDE.md rule 8): every time you tell the owner is Israel local time (IST): run TZ=Asia/Jerusalem date, convert UTC from logs/GitHub/Vercel before quoting, never write UTC to the owner."
echo "SCREENSHOT RULE (CLAUDE.md): if the owner's message includes a screenshot complaining about how something looks, your reply MUST include a screenshot of the same view after the fix (same page, viewport, state). One command: node scripts/shot.mjs \"/path\" [--click TEXT] [--sel CSS] [--phone] --out <scratchpad>/x.png, then SendUserFile. Do not call the fix done without it."
# Smoke credentials: say plainly what this session has, so nobody claims they are "saved" when they are not. Names only, never values.
missing=""
for v in SMOKE_EMAIL SMOKE_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY TMDB_TOKEN; do [ -z "${!v}" ] && missing="$missing $v"; done
if [ -n "$missing" ]; then
  echo "SMOKE ENV: missing in this session:$missing. 'npm run smoke' cannot sign in until they are set (CI has its own repo secrets). Do not say they are saved; see CLAUDE.md 'Smoke credentials'."
else
  echo "SMOKE ENV: all smoke variables are set; 'npm run smoke' can run here."
fi
exit 0
