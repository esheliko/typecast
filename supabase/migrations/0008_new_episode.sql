-- Why a series came back from Watched: the newest unseen episode that had aired (set when it moves to Watching, cleared when
-- it is marked Watched again or progress passes it). The app works without these columns until this runs.
alter table public.library_items add column if not exists new_episode_at timestamptz;
alter table public.library_items add column if not exists new_episode_s integer;
alter table public.library_items add column if not exists new_episode_e integer;
alter table public.library_items add column if not exists new_season boolean not null default false;
