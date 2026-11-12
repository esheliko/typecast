#!/usr/bin/env bash
# UserPromptSubmit: when the owner's message carries an image, put the screenshot rule in front of Claude for this turn.
in=$(cat)
if printf '%s' "$in" | grep -qiE '\[Image|"type" *: *"image"|/images/[^ ]*\.(png|jpe?g|webp)'; then
  echo "SCREENSHOT RULE (CLAUDE.md 'Screenshot complaints'): this message has an image. If it complains about how something looks, your reply MUST include a screenshot of the same exact view after the fix, same page, viewport and state as theirs. Cheapest way: node scripts/shot.mjs \"/path\" [--click \"Visible text\"] [--sel \"css\"] [--phone] --out <your scratchpad dir>/x.png (builds, serves, signs in, prints the path), then SendUserFile it. If you cannot reproduce the view, say so and show the closest one. Do not call it done without the picture."
fi
exit 0
