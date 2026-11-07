-- How much you want to watch a "To watch" title: someday (eventually) or must (must-watch list).
alter table public.library_items
  add column if not exists priority text not null default 'someday' check (priority in ('someday', 'must'));
