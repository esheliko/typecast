# Typecast

Find out where you know actors from, keep a list of what you watch, and see where to stream it.

Next.js (App Router) on Vercel, Supabase for the database and password sign-in, TMDB for film and TV data. It installs on a phone as an app (PWA).

```
src/app            pages, API routes and server actions
src/lib/tmdb.ts    TMDB client (server only, the token never reaches the browser)
src/lib/enrich.ts  "where do I know them from": exact matching of cast credits against your library
src/lib/connect.ts shared titles between two actors (or co-stars linking them), shared cast between two titles, your regulars
src/components/cast  the Browse tab: browse grid with one-tap Watched / To watch, and Connections
src/lib/ask.ts     Watching now: the Ask companion (Claude via Vercel AI Gateway, with TMDB tools and your library)
src/lib/library.ts reads your library and settings from Supabase
supabase/migrations/0001_init.sql   tables and row-level security
supabase/migrations/0002_priority.sql   "Some day" / "Must watch" level for To watch titles
supabase/migrations/0004_detail_order.sql   your chosen order of title-page details (director, composer, cast…)
artifact.html      the earlier single-file claude.ai artifact (not part of the site)
```

## Set up

### 1. TMDB
Create a free account at themoviedb.org, then request an API key under Settings, then API. Copy the **API Read Access Token**.

### 2. Supabase
1. Create a project at supabase.com and run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Under Authentication, then Sign In / Providers, turn off **Allow new users to sign up**. Typecast is private: accounts are created by you.
3. Under Authentication, then Users, choose **Add user**, **Create new user**, enter an email and password, and tick **Auto Confirm User**. Repeat for anyone you want to invite.
4. Under Authentication, then URL Configuration, set Site URL to your Vercel URL.
5. Under Project Settings, then API, copy the Project URL and the publishable key.

### 3. Vercel
1. Push this repo to GitHub, then Add New, Project, in Vercel and import it.
2. Add these environment variables:

| Name | Value |
|---|---|
| `TMDB_TOKEN` | the TMDB read access token |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
| `TMDB_LANGUAGE` | optional, for example `de-DE` |

3. Deploy. Open the site on your phone and install it: iPhone, Safari, Share, Add to Home Screen. Android, Chrome menu, Install app.
4. In Typecast open Setup and choose your country and streaming services.

### Local development
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

## Credits
This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.
