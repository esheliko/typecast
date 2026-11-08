-- Audit trail for list imports (Setup > Import). One row per batch of up to 25 lines: what was received, what each line
-- matched on TMDB (movie and TV candidates, which was stored), what was added/updated, and what could not be matched.
-- Read it with the service role / SQL editor; users can only read their own rows and cannot edit or delete them.
create table if not exists public.import_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  received integer not null default 0,
  kept integer not null default 0,
  added integer not null default 0,
  updated integer not null default 0,
  unmatched jsonb not null default '[]'::jsonb,
  failure text,
  trace jsonb not null default '[]'::jsonb
);
create index if not exists import_log_user_created on public.import_log (user_id, created_at desc);
alter table public.import_log enable row level security;
drop policy if exists "own import log read" on public.import_log;
create policy "own import log read" on public.import_log for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own import log insert" on public.import_log;
create policy "own import log insert" on public.import_log for insert to authenticated with check (auth.uid() = user_id);
