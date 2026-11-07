-- Typecast schema. Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  country text not null default 'US',
  services integer[] not null default '{}',
  service_names jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.library_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_type text not null check (tmdb_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null,
  year text not null default '',
  poster_path text,
  status text not null check (status in ('watching', 'watchlist', 'watched')),
  rating smallint not null default 0 check (rating between 0 and 5),
  note text not null default '',
  progress_season integer,
  progress_episode integer,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, tmdb_type, tmdb_id)
);

create index if not exists library_items_user_status on public.library_items (user_id, status);

alter table public.profiles enable row level security;
alter table public.library_items enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own library" on public.library_items;
create policy "own library" on public.library_items
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
