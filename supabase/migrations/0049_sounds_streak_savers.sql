-- ============================================================================
-- 0049 — Batch 22: drop sounds + streak-saver nudges.
-- Sounds are Deezer track previews attached to a drop. The streak saver
-- runs Sunday 23:00 UTC: users whose streak (>= 2 weeks through last
-- week) has no activity yet this week get ONE 'streak' notification.
-- ============================================================================

alter table public.drops
  add column if not exists sound_title text,
  add column if not exists sound_artist text,
  add column if not exists sound_preview_url text,
  add column if not exists sound_cover_url text;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('W', 'L', 'follow', 'comment', 'approved', 'requested', 'mention', 'like', 'reminder', 'recap', 'streak'));

create or replace function public.send_streak_savers()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  n integer := 0;
  wk timestamp := date_trunc('week', now());
begin
  for r in
    with activity as (
      select author_id as uid, created_at from public.drops
      union all
      select user_id, created_at from public.verdicts
      union all
      select user_id, created_at from public.comments
    ),
    by_week as (
      select uid,
        bool_or(created_at >= wk - interval '7 days' and created_at < wk) as prev1,
        bool_or(created_at >= wk - interval '14 days' and created_at < wk - interval '7 days') as prev2,
        bool_or(created_at >= wk) as this_week
      from activity
      group by uid
    )
    select uid from by_week
     where prev1 and prev2 and not this_week
  loop
    if not exists (
      select 1 from public.notifications
       where user_id = r.uid and kind = 'streak'
         and created_at > now() - interval '6 days'
    ) then
      insert into public.notifications (user_id, actor_id, kind, drop_id)
      values (r.uid, r.uid, 'streak', null);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

do $$
begin
  perform cron.unschedule('tally-streak-savers');
exception when others then null;
end $$;

select cron.schedule('tally-streak-savers', '0 23 * * 0', 'select public.send_streak_savers()');
