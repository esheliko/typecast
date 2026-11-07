-- Adds a "partial" status: seen some of a title but no plan to finish it ("familiar with").
alter table public.library_items drop constraint if exists library_items_status_check;
alter table public.library_items
  add constraint library_items_status_check check (status in ('watching', 'partial', 'watchlist', 'watched'));
