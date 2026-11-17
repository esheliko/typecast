-- Release date of the title, so a cached IMDb score can be kept longer the older the title is (new releases are re-checked sooner).
-- Null for rows written before this column existed: they use the default 14-day rule until refreshed. Re-runnable.
alter table public.imdb_ratings add column if not exists released date;
