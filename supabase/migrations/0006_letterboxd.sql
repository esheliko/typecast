-- Optional Letterboxd link (see src/lib/letterboxd.ts). All null = not connected.
-- letterboxd_cursor is the newest diary entry already imported, so entries you later remove from your library are not re-added.
alter table public.profiles add column if not exists letterboxd_user text;
alter table public.profiles add column if not exists letterboxd_synced_at timestamptz;
alter table public.profiles add column if not exists letterboxd_cursor timestamptz;
alter table public.profiles add column if not exists letterboxd_error text;
