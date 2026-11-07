-- Remember when a title was marked watched, so a series with episodes aired since then returns to the watch list.
alter table public.library_items add column if not exists watched_at timestamptz;
alter table public.library_items add column if not exists checked_at timestamptz;
update public.library_items set watched_at = updated_at where status = 'watched' and watched_at is null;
