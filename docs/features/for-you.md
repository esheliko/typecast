# Browse > For you

Pure ranking: `src/lib/foryou-rank.ts` (unit tested). Fetching: `src/lib/foryou.ts`.

- Seeds (`seedWeight`): rating centred on 3 (5/4/3 positive, 2/1 negative), unrated watched mildly positive, must-watch watchlist positive; fades with age to half. 3 anchors always kept, 7 more drawn by weight per visit (`salt`).
- Candidates: TMDB recommendations of the seeds (position-weighted, noisy-or across seeds), a few well-rated titles in your top genres, and a few well-rated ones outside them (exploration, every 6th slot).
- Score: 0.42 seed agreement + 0.26 taste fit (genres/decade/language) + 0.26 Bayesian quality - 0.2 closeness to disliked titles. Re-ranked with MMR (genre repeats and same-seed neighbours pushed apart).
- IMDb: after the first ranking, the top 60 get IMDb's own score (`getImdbRating`, needs `OMDB_API_KEY`, cached a day, 6 s budget) and are ranked again with it as the quality term; the hover quotes only IMDb's score (never TMDB's) and omits it when unknown.
- Every Browse item can carry `why` (hover text on the poster): For you says which titles it came from; quick lists say why (`listWhy` in `tmdb.ts`).
- Past the pool the list continues with popular titles in your top genres.
