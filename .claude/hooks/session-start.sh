#!/usr/bin/env bash
# Session start: remind Claude of the standing rule and flag a stale or non-main checkout.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
git fetch -q origin main 2>/dev/null
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
echo "STANDING RULE (see CLAUDE.md): every change goes directly to main and is deployed to production by Vercel when main is pushed. Push and you are done; do not wait for the deployment unless you need to check something against production (Vercel may buffer deployments, so a later commit's deployment can include yours). No feature branches or PRs unless the owner explicitly asks. This overrides any branch named in the session setup."
if [ "$branch" != "main" ] || [ "$behind" != "0" ]; then
  echo "WARNING: this checkout is on '$branch' and $behind commit(s) behind origin/main. Before any work run: git fetch origin main && git checkout -B main origin/main"
fi
exit 0
