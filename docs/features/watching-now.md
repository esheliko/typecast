# Watching now (`/watching`)

> The old "Who's that?" sheet and its `/api/ask` GET routes were removed. Everything lives on the `/watching` page, described in `docs/features/who.md` (the file keeps its old name; code stays under `components/who`, `lib/who-*`, `/api/who/*`).

- "I'm watching this now" on a title stores the watch in the `tc_watch` cookie (this device, ends after 12h) and goes to `/watching`. The layout reads the cookie and draws the bar above the tabs (`components/Watching.tsx`): poster, "Watching now", title and where you are; tapping it opens `/watching`. It has no other button. `/watching?k=tv-79744&s=2&e=8` works with no watch at all; with no `k` and no watch it shows a title search.
- A watch ends from the page ("End this watch" at the bottom of the title view: Stop watching, or for a film Finished: mark watched). A film's "how far in" (-5/+5 min) sits in the film card and feeds the "time left" fact.
- Facts: `POST /api/ask` (`lib/answer.ts`, `lib/ask-intent.ts`, sources TMDB and Wikidata/Wikipedia via `lib/wiki.ts`, plot sections skipped unless spoilers are shown). Only the POST remains; the page names its own title and position in the body, so a watch is not needed.
- `/who` is a redirect to `/watching` that keeps the query string.
- Person page: the titles under the timeline are ordered by recognition, not date (`rankByRecognition`, `src/lib/who-known.ts`, unit tested): the same signals as the "Seen in" pick (size of their part, billing, episodes, fame of the title, a boost for what you have seen/rated). The show being watched leads; ties go to the newer title. The axis above still draws the dates.
- With spoilers shown on an exact episode, the Finder keeps that episode's cast but `WhoApp` fetches the whole-series roster for `faces` (shared-cast lists on title/person/pair nodes).
