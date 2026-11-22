#!/usr/bin/env bash
# UserPromptSubmit: one short reminder per owner message (full rules: CLAUDE.md top).
cat >/dev/null
cat "$(dirname "$0")/rules-prompt.txt" 2>/dev/null  # generated from process/rules.json (npm run rules:build)
exit 0
