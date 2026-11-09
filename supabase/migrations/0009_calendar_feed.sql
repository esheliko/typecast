-- Subscribable calendar feed (/cal/<token>.ics). The token is a long random secret stored as-is, so Settings can show the link again.
-- Re-runnable. The app works without this (the Settings card stays hidden and /cal/... answers 404) until it has run.
alter table public.profiles add column if not exists calendar_token text;
create unique index if not exists profiles_calendar_token_key on public.profiles (calendar_token) where calendar_token is not null;

-- The ONLY way the feed reads a library without a signed-in user: it takes the token and nothing else, and returns just what the
-- feed needs (country and each title's type, id, name, year, status, priority). Null for an unknown or too-short token.
create or replace function public.calendar_library(tok text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; c text;
begin
  if tok is null or length(tok) < 32 then return null; end if;
  select p.user_id, p.country into uid, c from public.profiles p where p.calendar_token = tok;
  if uid is null then return null; end if;
  return jsonb_build_object(
    'country', c,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('type', l.tmdb_type, 'id', l.tmdb_id, 'title', l.title, 'year', l.year,
                                         'status', l.status, 'priority', l.priority,
                                         'updated', (extract(epoch from l.updated_at) * 1000)::bigint))
      from public.library_items l where l.user_id = uid), '[]'::jsonb));
end $$;

revoke all on function public.calendar_library(text) from public;
grant execute on function public.calendar_library(text) to anon, authenticated;
