-- Which title-page sections to show and in what order (see src/lib/details.ts). Null = the default order.
alter table public.profiles
  add column if not exists detail_order text[];
