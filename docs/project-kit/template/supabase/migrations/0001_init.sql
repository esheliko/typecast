-- Starting point. Add new numbered files (0002_...); keep them re-runnable and additive.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
