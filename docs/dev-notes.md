# Dev notes (moved verbatim out of CLAUDE.md; read the section you need)

<a id="popup"></a>
## popup

- Titles and people open as a popup over the current page: `src/app/(app)/@modal/(popup)/(.)title/…` and `(.)person/…` intercept soft navigation to `/title/…` and `/person/…` (hard loads restore the popup over the last background page via `RestorePopup`/`BgTracker`; `?full=1` gives the full page). Both share one `Modal` frame (`(popup)/layout.tsx`) so Back/Forward walk mixed title → person → title trails, and the bodies are `TitleView` / `PersonView`; from the 3rd step on `PopupTrail` (`components/Trail.tsx`, pure steps in `src/lib/trail.ts`, `ptrail-` classes) shows the path as one scrolling line of crumbs that jump back through history (never reuse the `wx-` trail classes). Link to titles with `TitleLink` and to people with `PersonLink` (`components/Modal.tsx`), never a bare `Link`. The marks (`LibProvider`) live in `(app)/layout.tsx` so the popup, Browse and Library share them.

<a id="speed"></a>
## speed

- Speed: functions run in `bom1` (`vercel.json`) next to the Supabase project (ap-south-1); keep them together. Auth is checked with `getClaims()` (local JWT verification), not `getUser()`. Nothing in `app/(app)/layout.tsx` may await TMDB: the new-episode check runs in `<Recheck />` behind Suspense. Pages need a shaped skeleton in `loading.tsx` (`components/Skeletons.tsx`); pass `it={item}` to `TitleLink` so the popup can show the poster and title instantly.

<a id="lint"></a>
## lint

- Lint: `eslint.config.mjs` uses the native flat configs of `eslint-config-next` 16. Its React Compiler rules (`react-hooks/refs`, `purity`, `set-state-in-effect`, `error-boundaries`, `immutability`) are switched off because the app does not use the compiler and ~60 existing patterns trip them; turn them on only together with a cleanup. Turbopack is the default bundler for dev and build.

<a id="verification"></a>
## verification

- Verification: `npm run lint` (eslint + boundary check), `npm run typecheck`, `npm test` (unit tests in `tests/unit`, pure `src/lib` code), `npm run smoke` (Playwright, `tests/smoke`: signs in as a dedicated test user, seeds a few rows, loads every page; see DEPLOYING.md). CI (`.github/workflows/ci.yml`, check `verify`) runs all of it and the Deploy Manager only deploys a head commit whose `verify` passed. `npm run eval:import -- tests/import-eval/list-2.txt --expect tests/import-eval/list-2.expect.json` measures the matcher on a real list against live TMDB (needs `TMDB_TOKEN`; not in CI); when the owner pastes a new import list, save it under `tests/import-eval/`, run this before and after, and read the SURE list for wrong picks, not just the counts. Add a smoke step for any new page or data-dependent branch, and a unit test for new pure logic. `tests/smoke/visual.spec.ts` (helpers in `visual.ts`) opens every page on a phone and a laptop viewport, after the service worker controls the page, and fails on a blank page, sideways scroll, a visible poster that did not load, a console error or a CSP violation (the smoke specs also fail on CSP violations); it saves screenshots to `visual-shots/` (CI artifact, 7 days) for a human look. Any change to `public/sw.js` or the CSP in `next.config.ts` must keep it green, and anything the worker fetches must be allowed by the worker's own CSP. Add new pages to its `PAGES` list.

<a id="debug"></a>
## debug

- Debugging production: the error screen shows `Reference <digest>`. `node scripts/logs.mjs --digest <digest>` (or no args for recent errors, `--path /library`, `--all`) prints the real server error from the Vercel runtime logs (no token needed in Claude sessions). `src/instrumentation.ts` logs one JSON `request_error` line per failed render/route/action with the same digest, route and a short stack. Runtime logs only keep about an hour, so look soon.

<a id="today"></a>
## today

- "Today" is the user's own day, never `new Date().toISOString().slice(0, 10)` (that is UTC, a day behind in India until 05:30). The country picked in Settings stands in for a time zone: `src/lib/today.ts` (`tzOf`, `dayIn`, `todayFor`, unit tested). Server code takes `tzOf(profile.country)`; client components get `today` as a prop. TMDB air/release dates stay plain strings compared against that day.

<a id="where"></a>
## where

- Where to watch is JustWatch data via TMDB and has gaps (e.g. Disney+ has no Israel entry): a country with no entry is "we don't know", never "Not available". Pure `whereVerdict` (`src/lib/where.ts`, unit tested) picks here / paid / elsewhere / unknown; `components/Where.tsx` and the Ask answer say where it streams elsewhere and that we can't tell for the user's country.
