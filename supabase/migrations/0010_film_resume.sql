-- Film resume: where a film you are in the middle of was stopped (whole minutes in) and the film's runtime at that moment,
-- so the Library can say "stopped at 52:00 of 1h 48m" without asking TMDB. Cleared when the film is marked Watched. RLS is unchanged
-- (the existing policies on library_items cover every column). The app works without these columns until this runs.
alter table public.library_items add column if not exists stopped_min integer;
alter table public.library_items add column if not exists stopped_of integer;
