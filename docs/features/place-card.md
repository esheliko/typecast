# Place card, quick Watched button, Continue cards

> Read before changing these. Pure logic: `src/lib/place-strip.ts` (`tests/unit/place-strip.test.ts`). Parts: `components/PlaceStrip.tsx`, `RowWatched` in `components/LibraryList.tsx`, `rankUpNext` in `src/lib/upnext.ts`.

**One idea.** The saved place of a Watching series is its library progress (the episode BEFORE the one you are on). The episode to show and continue with is `continuePlace` (via `upNextPlace`). It is also the spoiler line (`docs/features/spoilers.md`): these surfaces show nothing past that episode and fetch nothing past it.

**Place card** (top of a series popup, above the mark-card; renders only while the series is Watching in the library, reactive to `LibProvider`, so it appears when you start watching).
- Grid row: tiny "Up next ▾" (opens the existing `PositionPicker` in `strip` mode: no Next button, no Whole series/season rows, episodes after the shown one are listed by number only) over "S3 E7 · Paper Trail" over "47 min · 22 of 36 watched"; right: gold "Watched ✓"; under it a 4px bar.
- "Watched ✓" = `useSavedPlace().next(place, null, { engage: false })`: ONE `setProgress` write, toast "S3 E7 marked watched" + Undo, no `revalidatePath`, no Watching-now bar. Picking another episode in the picker = `useSavedPlace().jump(p)`: one write, any direction, toast "Place set: S3 E5" + Undo.
- States (`placeCard`): `next` (out: button), `unaired` ("airs Fri 21 Oct", no button), `done` ("All caught up"; ended series also get "Mark series watched").
- The S/E headline needs only the saved place. Episode name, runtime and air date are fetched afterwards from `/api/who/season?tv&s&upto=<e>` (the route drops later episodes) and fail soft. The episode's own air date can turn a "next" into "unaired" when TMDB's latest-aired lags.

**Library rows.** `RowWatched`: gold "Watched ✓" on Watching series only, from the row's own progress (no per-row TMDB call). At the tap it asks once for the size of the progress' season (cached) so a season's last episode rolls to the next season (`rowNext`); if that fails it takes the next number. One `setProgress` write, `touch()` + `setPlace`, toast with Undo.

**Watch next.** A Watching series whose next episode is out (`nextOut`: needs season sizes and the newest aired episode) is a `continue` card "S3 E7 · out now" + Continue link, with the episode runtime ("47 min"). Without TMDB facts it stays "After S3 E6". New card kinds: add to `PickKind`, set `go` and optionally `cta` (the link word, default "Continue", e.g. a film "Resume"); `UpNext.tsx` renders any card with `go`.
