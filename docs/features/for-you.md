# Browse > For you

Pure ranking: `src/lib/foryou-rank.ts` (unit tested). Fetching: `src/lib/foryou.ts`.

- Seeds (`seedWeight`): rating centred on 3 (5/4/3 positive, 2/1 negative), unrated watched mildly positive, must-watch watchlist positive; fades with age to half. 3 anchors always kept, 7 more drawn by weight per visit (`salt`).
- Candidates: TMDB recommendations of the seeds (position-weighted, noisy-or across seeds), a few well-rated titles in your top genres, and a few well-rated ones outside them (exploration, every 6th slot).
- Seeds are fetched with `append_to_response` (keywords + credits in the same call, cached a week), so people and themes cost no extra request. `parseExtras` reads them: director (films) / creators (series) count fully, the six top-billed cast by billing.
- People: `buildProfile` weights each person by seed weight x billing. People at weight >= 2.4 (up to 3) add their best other work (`/person/<id>/combined_credits`, >= 300 votes, >= 6.8) to the pool with a mild vote. `peopleFit` is a noisy-or over the people on a candidate you like.
- Themes: keyword overlap (`kwFit`) is part of taste fit once a candidate's keywords are known; the disliked profile uses it too.
- On your services: when the profile has a country and services, a discover call (`with_watch_providers`, flatrate) in your top genres adds titles flagged `onService` (+0.04). It only flags titles from that call.
- Score: 0.38 seed agreement + 0.24 taste fit (genres 0.5/keywords 0.25/decade 0.15/language 0.1; genre-heavy blend until keywords are known) + 0.24 Bayesian quality + 0.14 people - 0.2 closeness to disliked titles. Re-ranked with MMR (genre repeats and same-seed neighbours pushed apart).
- Second pass: after the first ranking, the top 30 also get keywords + cast (one cached detail call each, fired together with the IMDb ids, 1.2 s budget). Unknown data is never a penalty; it only adds when present. IMDb: those 30 get IMDb's own score (`peekImdbRatings`, needs `OMDB_API_KEY`) only when the score is already stored: page 1 never waits on OMDb, the missing ones are fetched after the response (`after`) for the next visit. They are ranked again with it as the quality term; the hover quotes only IMDb's score (never TMDB's) and omits it when unknown.
- The hover text also names the people ("Features X, who you liked in Y") and "On one of your services".
- Every Browse item can carry `why` (hover text on the poster): For you says which titles it came from; quick lists say why (`listWhy` in `tmdb.ts`).
- Past the pool the list continues with popular titles in your top genres.
- Speed: `/` does not await For you; the grid asks `/api/browse` with the visit's salt. The ranked order is kept per (user, kind, salt, library state) for 4 minutes in memory (`ttl-memo.ts`), so pages 2+ only slice it; `/api/browse` answers `Cache-Control: private, max-age=120`. Nudges are asked 1.5 s after the grid.
- Streaming: when the home list is For you, `page.tsx` starts `forYou()` without awaiting it and hands the promise to `Browse` as `firstStream`; the shell and the skeleton paint at once and the ranking arrives in the same response (no second round trip). If it comes back empty the grid asks `/api/browse` as before. The salt, the arguments and the 4-minute memo are the same as `/api/browse`, so later pages slice the one ranking.
