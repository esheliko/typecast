#!/usr/bin/env bash
# Session start: remind Claude of the standing rules (branch + PR) and flag a stale checkout.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
git fetch -q origin main 2>/dev/null
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
echo "STANDING RULES (CLAUDE.md top): never push to main; branch from origin/main, ONE PR, merge only on green verify, never deploy (Deploy Manager does), then ci-status --wait --for <sha> in background."
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
echo "CHAIN OF COMMAND: DEPLOYING.md, standing rules, .claude/, CI, deploy/smoke scripts belong to the Deploy Manager session (title exactly \"🚀 Deploy manager (typecast)\", ignore \"💀 (retired)\"); owner asks for those go to it via send_message, never edit them, unless the owner says edit directly."
echo "TIMES to the owner: always IST (TZ=Asia/Jerusalem date), never UTC."
echo "REPLY: line 1 = 🔴 NEEDS YOU: <ask> | 🟢 DONE: <result> (nothing open) | ⚙️ AUTO: <status> (turns the owner did not type); change requests add \"What I did:\" bullets (CLAUDE.md tag rules)."
echo "SCREENSHOTS: show one (node scripts/shot.mjs, SendUserFile) for any visual complaint or visual choice of yours; skip only if the owner dictated the exact look or nothing visible changes (CLAUDE.md)."
# Smoke credentials: say plainly what this session has, so nobody claims they are "saved" when they are not. Names only, never values.
missing=""
for v in SMOKE_EMAIL SMOKE_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY TMDB_TOKEN; do [ -z "${!v}" ] && missing="$missing $v"; done
if [ -n "$missing" ]; then
  echo "SMOKE ENV: missing in this session:$missing. 'npm run smoke' cannot sign in until they are set (CI has its own repo secrets). Do not say they are saved; see CLAUDE.md 'Smoke credentials'."
else
  echo "SMOKE ENV: all smoke variables are set; 'npm run smoke' can run here."
fi
exit 0
