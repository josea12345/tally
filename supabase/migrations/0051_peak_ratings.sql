-- ============================================================================
-- 0051 — The Peak pivot: typed ratings replace W/L verdicts.
-- 1) drop_ratings: one typed score (0.0–10.0, one decimal) per user per drop.
--    The drop's author cannot rate their own drop — their score is the
--    drop's author "call" (drops.score), which stays separate by design.
-- 2) drops.score + comments.rating: smallint 1–10 -> numeric(3,1) 0–10.
-- 3) Verdicts go dormant: the verdicts_notify trigger is dropped (the table
--    and its 3 rows stay; nothing reads them after this pivot).
-- 4) Notifications learn 'peak': rating a drop 10.0 notifies its author,
--    gated by the same notify_wl preference that covered W/L.
-- 5) Weekly recaps + streak savers now count ratings as the activity.
-- ============================================================================

create table if not exists public.drop_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  score numeric(3,1) not null
    constraint drop_ratings_score_check check (score >= 0 and score <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drop_ratings_unique unique (user_id, drop_id)
);

create index if not exists drop_ratings_drop_idx on public.drop_ratings (drop_id);
create index if not exists drop_ratings_user_idx on public.drop_ratings (user_id);
create index if not exists drop_ratings_created_idx on public.drop_ratings (created_at desc);

drop trigger if exists drop_ratings_touch on public.drop_ratings;
create trigger drop_ratings_touch
  before update on public.drop_ratings
  for each row execute function public.touch_updated_at();

alter table public.drop_ratings enable row level security;

-- Ratings are public-facing by design (averages are shown to everyone),
-- mirroring the old verdicts "public read" transparency.
drop policy if exists "drop_ratings public read" on public.drop_ratings;
create policy "drop_ratings public read"
  on public.drop_ratings for select using (true);

drop policy if exists "drop_ratings own insert" on public.drop_ratings;
create policy "drop_ratings own insert"
  on public.drop_ratings for insert
  with check (
    auth.uid() = user_id
    and public.drop_author_id(drop_id) is distinct from auth.uid()
    and public.can_interact_with_drop(drop_id)
  );

drop policy if exists "drop_ratings own update" on public.drop_ratings;
create policy "drop_ratings own update"
  on public.drop_ratings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.drop_author_id(drop_id) is distinct from auth.uid()
  );

drop policy if exists "drop_ratings own delete" on public.drop_ratings;
create policy "drop_ratings own delete"
  on public.drop_ratings for delete
  using (auth.uid() = user_id);

grant select on public.drop_ratings to anon;
grant select, insert, update, delete on public.drop_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- Decimal scores on the two existing 1–10 scales.
-- ---------------------------------------------------------------------------
alter table public.drops drop constraint if exists drops_score_check;
alter table public.drops
  alter column score type numeric(3,1) using score::numeric(3,1);
alter table public.drops
  add constraint drops_score_check
  check (score is null or (score >= 0 and score <= 10));

alter table public.comments drop constraint if exists comments_rating_check;
alter table public.comments
  alter column rating type numeric(3,1) using rating::numeric(3,1);
alter table public.comments
  add constraint comments_rating_check
  check (rating is null or (rating >= 0 and rating <= 10));

-- ---------------------------------------------------------------------------
-- Verdicts go dormant.
-- ---------------------------------------------------------------------------
drop trigger if exists verdicts_notify on public.verdicts;

-- ---------------------------------------------------------------------------
-- 'peak' notifications.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('W', 'L', 'follow', 'comment', 'approved', 'requested',
                  'mention', 'like', 'reminder', 'recap', 'streak', 'peak'));

create or replace function public.emit_notification(
  p_recipient uuid,
  p_actor uuid,
  p_kind text,
  p_drop uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pref boolean;
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;

  v_pref := case
    when p_kind in ('W', 'L', 'peak') then coalesce(
      (select notify_wl from public.profiles where id = p_recipient), true)
    when p_kind in ('comment', 'mention', 'like') then coalesce(
      (select notify_comments from public.profiles where id = p_recipient), true)
    else coalesce(
      (select notify_follows from public.profiles where id = p_recipient), true)
  end;
  if not v_pref then
    return;
  end if;

  if p_kind in ('W', 'L') and p_drop is not null then
    delete from public.notifications
      where user_id = p_recipient
        and actor_id = p_actor
        and drop_id = p_drop
        and kind in ('W', 'L');
  end if;

  if p_kind = 'peak' and p_drop is not null then
    delete from public.notifications
      where user_id = p_recipient
        and actor_id = p_actor
        and drop_id = p_drop
        and kind = 'peak';
  end if;

  if p_kind = 'follow' then
    delete from public.notifications
      where user_id = p_recipient
        and actor_id = p_actor
        and kind = 'follow';
  end if;

  if p_kind = 'like' then
    delete from public.notifications
      where user_id = p_recipient
        and actor_id = p_actor
        and drop_id is not distinct from p_drop
        and kind = 'like';
  end if;

  insert into public.notifications (user_id, actor_id, kind, drop_id)
  values (p_recipient, p_actor, p_kind, p_drop);
end $$;

create or replace function public.trg_drop_rating_peak_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_author uuid;
begin
  if TG_OP = 'DELETE' then
    if OLD.score = 10 then
      select author_id into v_author from public.drops where id = OLD.drop_id;
      delete from public.notifications
        where user_id = v_author and actor_id = OLD.user_id
          and drop_id = OLD.drop_id and kind = 'peak';
    end if;
    return OLD;
  end if;

  select author_id into v_author from public.drops where id = NEW.drop_id;

  if NEW.score = 10 then
    perform public.emit_notification(v_author, NEW.user_id, 'peak', NEW.drop_id);
  elsif TG_OP = 'UPDATE' and OLD.score = 10 then
    -- Rated down from a 10: the mountain (and its alert) goes away.
    delete from public.notifications
      where user_id = v_author and actor_id = NEW.user_id
        and drop_id = NEW.drop_id and kind = 'peak';
  end if;
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists drop_ratings_peak_notify on public.drop_ratings;
create trigger drop_ratings_peak_notify
  after insert or update or delete on public.drop_ratings
  for each row execute function public.trg_drop_rating_peak_notify();

-- ---------------------------------------------------------------------------
-- Recaps + streak savers count ratings now.
-- ---------------------------------------------------------------------------
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
      from public.drop_ratings v
      join public.drops d on d.id = v.drop_id
     where v.created_at > now() - interval '7 days'
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

-- Streak savers: ratings join drops + comments as streak activity
-- (verdicts stay in the union for historical weeks).
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
      select user_id, created_at from public.drop_ratings
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
