# Watch next

> Moved verbatim out of CLAUDE.md so sessions only read it when they touch this feature.

- Watch next (Library, `components/UpNext.tsx`) is ranked by `rankUpNext` (`src/lib/upnext.ts`, pure, unit tested): in-progress titles lead only while fresh (`updated_at` within 21 days; stale ones sink, at most one shown as "still want to finish?", unless new episodes aired), then the watchlist scored by new episodes, your streaming services, recommendations from rated titles, genre taste, TMDB rating, must-watch and recency (unreleased left out), with new picks from outside the library mixed in. `loadUpNext` (`src/lib/upnext-data.ts`) fetches the TMDB facts behind Suspense; the fallback is the same ranking without TMDB. "Not now" hides a card for 30 days on that device; the "On my services" chip (remembered per device) keeps only picks streaming on the services picked in Settings (`onYourServices`; negative service ids are manual labels and are skipped via `realServices`). A Both / New picks / My library switch (`bySource`, remembered per device) filters by where a pick comes from (`discover` = outside the library); up to 8 discoveries are ranked so "New picks" is not nearly empty. "New picks" means anything not in the library at all (watchlist counts as library). The strip also has its own Films / Series switch (remembered per device) on top of the Library's.

## Header and tap targets (mobile)
The Watch next and Upcoming headers are one tappable bar (36px high, gold edge, count pill, chevron). Watch next's filters sit in the same row and scroll sideways, never a second line; Upcoming's bar previews the next entry ("Film · in 3 days") while collapsed. Continue / Resume are gold pills and the card's × has a 46px hit area, so none of them add height. Keep new controls inside that single row.

## Status order (display only)
Statuses read by intent: To watch (future), Watching (now, gold-outlined), then Watched and Partly watched as one "past" pair.
`src/lib/status-order.ts` holds the order (`LIBRARY_TAB_ORDER`, `STATUS_GROUP`, `tabGroup`, unit tested). Used by the Library filter chips
(`lib-now`, `lib-past`, `lib-pair-start`) and the title popup menu (`mc-now`, `.mc-pair`, group label "Past"). Labels, `?f=` values, stored
statuses, QuickMark, SEEN sets and `CreditList` weights are unchanged. The stats page list keeps its own order (watched first, it counts what was done).

## Continue cards, "Still watching?" (step 5B)

- Library `progress_season/progress_episode` means "watched up to and including", so a card never says "Continue from S3 E8". `continueLabel(progress, seasons?, lastEp?)` (`src/lib/watch-library.ts`, unit tested): "Next: S3 E9", rolling to "Next: S4 E1" at a season end; "Caught up" when that episode has not aired (`caughtUp`: past `Facts.lastEp` or past the last known season), followed by the usual "· new ep Thursday"; "After S3 E8" without season sizes (the instant `quickPicks` fallback with no TMDB); "Pick up where you left off" with no progress. Season sizes and `lastEp` come from the same `/tv/{id}` response in `getPickBasics` (no extra call) into `Facts.seasons` / `Facts.lastEp`.
- Continue cards come from Watching only, and ALL fresh Watching titles lead (no cap of 4; only the whole strip is capped). Partly watched is never a continue card (it means stopped or seen a bit); it appears only as a "New episodes" card when an episode aired after your last touch, after the Watching ones.
- A continue card has a small "Continue" link in its text line to `continueHref(row, seasons?)` (`/watching?k=tv-ID&s=..&e=..`, the episode after the progress; `pickUpCards` uses the same function). The card stays a `TitleLink` for the popup; the text line sits outside it so the link is not nested in an anchor. No Continue link when caught up or without progress. Adds no height.
- "Still watching?" (`isStillWatching`, `STILL_WATCHING_DAYS` = 42): a WATCHING title (not Partly) untouched for more than 6 weeks with no new-episode flag and no aired episode newer than the last touch; at most one (the most recently touched), near the end of the strip. Two buttons over the poster: "Keep" (the existing 30-day local "Not now" snooze, no write) and "Move to Partly watched" (one `useLib().mark(item, "partial")`, toast with Undo; the card is hidden locally until the next refresh). Never automatic. `updated_at` is bumped by marks, ratings, notes, priority and progress, not by opening /watching.

## Summary rule (moved from CLAUDE.md)

- Watch next (Library) is ranked by pure `rankUpNext` (`src/lib/upnext.ts`, unit tested); `loadUpNext` fetches TMDB facts behind Suspense and falls back to the same ranking without TMDB. Details: `docs/features/watch-next.md` (read before changing this feature).
