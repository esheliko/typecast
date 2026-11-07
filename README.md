# Typecast

Find out where you know actors from, keep a list of what you watch, and see where to stream it.

Next.js (App Router) on Vercel, Supabase for the database and sign-in, TMDB for film and TV data. It installs on a phone as an app (PWA).

```
src/app            pages, API routes and server actions
src/lib/tmdb.ts    TMDB client (server only, the token never reaches the browser)
src/lib/enrich.ts  "where do I know them from": exact matching of cast credits against your library
src/lib/library.ts reads your library and settings from Supabase
supabase/migrations/0001_init.sql   tables and row-level security
artifact.html      the earlier single-file claude.ai artifact (not part of the site)
```

## Set up

### 1. TMDB
Create a free account at themoviedb.org, then request an API key under Settings, then API. Copy the **API Read Access Token**.

### 2. Supabase
1. Create a project at supabase.com.
2. Open the SQL editor and run `supabase/migrations/0001_init.sql`.
3. Under Authentication, then Email Templates, edit both **Magic Link** and **Confirm signup** so they show the code. Add this line to each:
   ```
   Your Typecast code is {{ .Token }}
   ```
   Typecast signs in with a six-digit code rather than a link, because links open in the browser and not in the installed app.
4. Under Authentication, then URL Configuration, set Site URL to your Vercel URL once you have it.
5. Under Project Settings, then API, copy the Project URL and the anon public key.

Supabase's built-in email sender is limited to a few emails per hour. Add your own SMTP provider under Authentication, then SMTP, if you sign in often.

### 3. Vercel
1. Push this repo to GitHub, then Add New, Project, in Vercel and import it.
2. Add these environment variables:

| Name | Value |
|---|---|
| `TMDB_TOKEN` | the TMDB read access token |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `ALLOWED_EMAILS` | your email, comma separated for several. Without it anyone can sign up. |
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
