-- 0016 — Trust & safety: blocks + reports.
-- Blocks hide drops in both directions, enforced at the database level.

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks own all" on public.blocks;
create policy "blocks own all" on public.blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  drop_id uuid references public.drops(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint reports_target check (drop_id is not null or reported_user_id is not null)
);
alter table public.reports enable row level security;
drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports
  for insert with check (auth.uid() = reporter_id);
drop policy if exists "reports own read" on public.reports;
create policy "reports own read" on public.reports
  for select using (auth.uid() = reporter_id);

create or replace function public.is_drop_visible(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_author_id)
         or (b.blocker_id = p_author_id and b.blocked_id = auth.uid())
    )
    and (
      not exists (
        select 1 from public.profiles p
        where p.id = p_author_id and p.is_private
      )
      or p_author_id = auth.uid()
      or exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid()
          and f.followee_id = p_author_id
      )
    );
$$;
