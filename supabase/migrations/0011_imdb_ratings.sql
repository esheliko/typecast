-- Durable cache of IMDb scores (from OMDb, whose free key allows ~1000 calls a day). One row per IMDb id; rating is null when OMDb answered
-- "no score". Read and written only by the server with the service-role key: RLS is on with no policies, so no browser can touch it.
-- The app works without this table (it just asks OMDb every time, as before).
create table if not exists public.imdb_ratings (
  imdb_id text primary key,
  rating real,
  votes integer not null default 0,
  fetched_at timestamptz not null default now()
);
alter table public.imdb_ratings enable row level security;
