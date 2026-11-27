# Performance: measurements and open ideas

Last sweep: PR #190 (merged 2026-11-27), done in two rounds. This file records how to measure and what is still open.

## How to measure
- `node scripts/perf.mjs --base <url> --runs 3 --out <file.json>` signs in as the smoke user (`SMOKE_EMAIL` / `SMOKE_PASSWORD`). It times these flows in a real browser, from the action until the content is visible:
  - Browse views and For you;
  - plain and connection searches;
  - a series page until its season faces show, switching season, opening an episode, and Cast by season;
  - the title and person popups;
  - /watching and /library.
- It also records every `/api`, document and RSC request with its timing.
- Use `--only browse,search,episode,popups` to keep a run short; a full run takes about 12 minutes. Run 1 counts as cold, runs 2 and up as warm.
- **Compare like with like.** A `*.vercel.app` preview link adds about 0.2 s to every request, even for edge-cached static files, compared with production. A PR preview against production is therefore not a fair comparison.
- For a fair test, deploy `main` as a preview too and time both previews back to back. Do the same if the owner is to judge by feel.
- A protected preview needs `PERF_SHARE=<_vercel_share token>`. The cloud environment may also need the host allowed.
- Local runs (`next start`) give relative numbers only, because the container is far from `bom1`.

## Result of #190 (warm medians, preview of main vs preview of PR)

| Flow | Before | After |
|---|---|---|
| Connection search | 0.66 s | 0.40 s |
| Connection search, first time ("tom hanks + meg ryan") | 11.5 s | 1.7 s |
| Series page until season faces, Breaking Bad | 4.8 s | 2.6 s |
| Series page until season faces, Game of Thrones | 4.9 s | 3.1 s |

These were unchanged: For you (on the smoke account's small library), switching season, opening an episode, Cast by season, the popups, Library and Watching.

## Open ideas (best payoff first)
1. **The double load on a hard refresh or a shared link to a title.**
   - `RestorePopup` (`components/Modal.tsx`) replays navigation on a hard load: `router.replace` to the page underneath, then a push to the popup.
   - That fetches `/title/<type>/<id>` again as RSC, about 1.2 s. It is most of why Cast by season takes about 4.5 s.
   - The season data no longer waits on it (`EpisodesWarm`, `lib/season-load.ts`). The duplicate fetch itself remains.
   - Idea: keep the replay, but make that RSC cheap. Render a light shell and stream the heavy sections behind Suspense, or cache the parts that do not depend on the user. Refresh and shared-link behaviour must stay the same.
2. **Timing on every request (`Server-Timing` headers or one log line).**
   - Today no response carries timing, so a slowdown is noticed by feel.
   - Add per-stage timing to the heavy routes and pages: `/api/browse` For you, `/api/search`, `/api/connect*`, `/api/who/find`, `/api/episode`, the title page.
   - Then `scripts/perf.mjs`, which already records `server-timing`, and `scripts/logs.mjs` show where the time goes.
3. **For you on a large library.** The smoke account has only a few titles, so the owner's real case was never measured.
   - Option A: fill a temporary account with a library the size of the owner's and time For you there.
   - Option B: rely on item 2 to read the owner's real refreshes.
   - The pipeline is in `lib/foryou.ts` (stage A seeds, stage B candidates, stage C details within a 1.2 s budget; ranking memoised 4 min).
4. **Switching season and opening an episode (0.6-0.8 s).**
   - Nearly all of it is TMDB on a cache miss.
   - Idea: prefetch the next season or episode on hover, focus or near-scroll, with the same cache keys as `lib/season-load.ts`. The spoiler line still applies server-side, so prefetching never shows anything early.
5. **Smaller items.**
   - `/api/who/find` stages now run concurrently but were not re-measured.
   - The 8 small `/api/imdb` calls on a title page (16-43 ms each) could be one batch, like `lib/batcher.ts`.
   - Each tab link prefetch is `_tree` plus a data request. That is Next's protocol for `prefetch={true}`, so leave it.
