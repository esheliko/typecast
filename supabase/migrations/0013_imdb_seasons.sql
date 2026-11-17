-- Durable cache of per-episode IMDb scores (from OMDb), one row per series season: eps is { "<episode number>": score }.
-- released = air date of the season's newest dated episode; it sets how long the row is kept (see ttlDays in src/lib/imdb-rating.ts).
-- Server-only, service-role key; RLS on with no policies. The app works without it. Re-runnable.
create table if not exists public.imdb_seasons (
  imdb_id text not null,
  season integer not null,
  eps jsonb not null default '{}'::jsonb,
  released date,
  fetched_at timestamptz not null default now(),
  primary key (imdb_id, season)
);
alter table public.imdb_seasons enable row level security;
