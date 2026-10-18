-- ============================================================================
-- 0009 — Notifications: votes, follows, comments
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade, -- recipient
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('W', 'L', 'follow', 'comment')),
  drop_id uuid references public.drops(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read"
  on public.notifications for select
  using (auth.uid() = user_id);

-- The actor creates the notification (client writes it at action time).
drop policy if exists "notifications actor insert" on public.notifications;
create policy "notifications actor insert"
  on public.notifications for insert to authenticated
  with check (auth.uid() = actor_id and actor_id <> user_id);

drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications own delete" on public.notifications;
create policy "notifications own delete"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- Realtime for the nav badge (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
