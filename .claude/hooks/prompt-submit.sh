#!/usr/bin/env bash
# UserPromptSubmit: when the owner's message carries an image, put the screenshot rule in front of Claude for this turn.
in=$(cat)
echo "REPLY FORMAT (CLAUDE.md): this is the owner's own message. Line 1 of your reply is 🔴 NEEDS YOU: <ask> (ask first, options + recommendation up top) or 🟢 DONE: <result> (only if fully done with no question, offer or pending choice; otherwise 🔴). Turns you are woken for later (CI, watcher, background task, peer) are ⚙️ AUTO: max 2 lines; an unanswered ask is repeated as the last line: ⏳ Still waiting on you: <ask>."
if printf '%s' "$in" | grep -qiE '\[Image|"type" *: *"image"|/images/[^ ]*\.(png|jpe?g|webp)'; then
  echo "SCREENSHOT RULE (CLAUDE.md 'Screenshot complaints'): this message has an image. If it complains about how something looks, your reply MUST include a screenshot of the same exact view after the fix, same page, viewport and state as theirs. Cheapest way: node scripts/shot.mjs \"/path\" [--click \"Visible text\"] [--sel \"css\"] [--phone] --out <your scratchpad dir>/x.png (builds, serves, signs in, prints the path), then SendUserFile it. If you cannot reproduce the view, say so and show the closest one. Do not call it done without the picture."
fi
exit 0
