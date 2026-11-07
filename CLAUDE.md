# Typecast: developer notes

Next.js 15 (App Router) + Supabase (email/password auth, RLS) + TMDB. See README.md for setup.

## Commands
- `npm run dev` / `npm run build` / `npm run typecheck`
- Build needs `TMDB_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dummy values are fine for a compile check).

## Conventions
- TMDB is only called server-side (`src/lib/tmdb.ts`); the token never reaches the browser.
- All writes go through server actions in `src/app/actions.ts` via `requireUser()`; RLS on `library_items` and `profiles` is the backstop.
- `src/middleware.ts` gates every route except `/login` and `/offline`; API routes return 401 JSON when signed out.
- `public/sw.js` caches only static assets and TMDB images; pages are always network-first. Bump the cache names when changing caching rules.
- Schema changes go in a new numbered file under `supabase/migrations/` (keep them re-runnable).
- `artifact.html` is the legacy single-file prototype, not part of the site.

## Known gaps
- No tests or ESLint config yet.
- `npm audit` flags PostCSS bundled inside Next 15; the fix requires Next 16.
