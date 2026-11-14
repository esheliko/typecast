# Film resume

A film you are in the middle of remembers where you stopped, so you can pick it up from the Library or Watch next.

## Data
- `library_items.stopped_min` (whole minutes in) and `stopped_of` (the runtime then, so no TMDB call is needed to say "of 1h 48m"). Migration `0010_film_resume.sql`; both nullable, RLS unchanged. The app works without the columns until the migration runs (reads give nothing, the write fails quietly).
- `LibItem.stoppedMin` / `stoppedOf` (server rows) and `Mark.stopped` (packed marks, suffix `t<minutes>`, only for a Watching film) so every surface follows `LibProvider`. `useLib().setStopped(key, min)` moves it on screen only (no write).

## Writes (never more than one)
- `FilmClock` (`components/who/PositionControl.tsx`) saves with `setStopped` (`app/actions.ts`): ONE debounced write (1.5 s) after the clock changes, at once on pause, and when the page is hidden or the clock unmounts. Only while the film is Watching in the library. Pure decision: `stoppedWrite` (`lib/film-resume.ts`, unit tested). The clock back at 0 clears it (a restart).
- Marking the film Watched clears both columns (best effort, `clearStopped` in `actions.ts`, like the new-episode flag).
- Opening the Resume sheet or moving its time writes NOTHING. Only "Resume watching" (the existing `start` flow, then the clock is set to the chosen time) and "Mark watched" do.

## Where it shows
- Library row of a Watching film with a stopped time: "stopped at 52:00 of 1h 48m", a thin bar, a gold Resume button (`LibraryList.tsx`). Films without one look as before.
- Resume sheet (`components/ResumeSheet.tsx`, reuses `.gl-wrap` and `.ask-step`): -5 / Play / +5, the time, a bar, "of 1h 48m · 56 min left", Resume watching, Mark watched. Classes are `rs-*`.
- Watch next: a `resume` card kind ("52:00 of 1h 48m · Resume"), `filmResume` in `lib/upnext.ts` (unit tested). A film untouched for 6 weeks stays a "Still watching?" card.

## Summary rule (moved from CLAUDE.md)

- Film resume: a Watching film remembers its stopped time (`library_items.stopped_min`/`stopped_of`, migration 0010; `Mark.stopped`). The film clock saves it with ONE debounced write; the Library row, the Resume sheet and a Watch next `resume` card show it. Opening the sheet writes nothing. Details: `docs/features/film-resume.md` (read before changing this feature).
