-- ============================================================================
-- 0045 — Batch 18: try-it reminders + Friday recap.
-- drop_reminders holds one pending reminder per (user, drop). A pg_cron
-- job dispatches due reminders every 15 minutes (insert notification,
-- which fires the push bridge, then delete the row) and sends Friday
-- recap notifications to authors whose drops got verdicts that week.
-- ============================================================================

create table if not exists public.drop_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  remind_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, drop_id)
);

create index if not exists drop_reminders_due_idx
  on public.drop_reminders (remind_at);

alter table public.drop_reminders enable row level security;

create policy "reminders own read" on public.drop_reminders
  for select using (user_id = auth.uid());
create policy "reminders own insert" on public.drop_reminders
  for insert with check (user_id = auth.uid());
create policy "reminders own update" on public.drop_reminders
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reminders own delete" on public.drop_reminders
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.drop_reminders to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('W', 'L', 'follow', 'comment', 'approved', 'requested', 'mention', 'like', 'reminder', 'recap'));

create or replace function public.dispatch_reminders()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select rem.id, rem.user_id, rem.drop_id, d.author_id
      from public.drop_reminders rem
      join public.drops d on d.id = rem.drop_id
     where rem.remind_at <= now()
  loop
    insert into public.notifications (user_id, actor_id, kind, drop_id)
    values (r.user_id, r.author_id, 'reminder', r.drop_id);
    delete from public.drop_reminders where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.send_weekly_recaps()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select distinct d.author_id as author
      from public.verdicts v
      join public.drops d on d.id = v.drop_id
     where v.created_at > now() - interval '7 days'
       and v.verdict is not null
  loop
    if not exists (
      select 1 from public.notifications
       where user_id = r.author and kind = 'recap'
         and created_at > now() - interval '6 days'
    ) then
      insert into public.notifications (user_id, actor_id, kind, drop_id)
      values (r.author, r.author, 'recap', null);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Schedules (idempotent: unschedule first when re-run).
do $$
begin
  perform cron.unschedule('tally-dispatch-reminders');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('tally-weekly-recaps');
exception when others then null;
end $$;

select cron.schedule('tally-dispatch-reminders', '*/15 * * * *', 'select public.dispatch_reminders()');
-- Fridays 22:00 UTC ≈ Friday evening US Eastern.
select cron.schedule('tally-weekly-recaps', '0 22 * * 5', 'select public.send_weekly_recaps()');
