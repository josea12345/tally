-- ============================================================================
-- 0037 — Batch 10: @mentions + realtime badge.
-- 1) notifications kind check learns 'mention'.
-- 2) emit_notification: mentions are gated by the comments preference.
-- 3) trg_comment_mentions: on comment insert, every @handle in the body
--    that resolves to a profile gets a 'mention' notification — except
--    the commenter and the person already getting the comment/reply
--    notification for this comment (no double-pings).
-- 4) notifications join the supabase_realtime publication so clients can
--    keep the unread badge live.
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('W', 'L', 'follow', 'comment', 'approved', 'requested', 'mention'));

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
    when p_kind in ('W', 'L') then coalesce(
      (select notify_wl from public.profiles where id = p_recipient), true)
    when p_kind in ('comment', 'mention') then coalesce(
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
  if p_kind = 'follow' then
    delete from public.notifications
     where user_id = p_recipient and actor_id = p_actor and kind = 'follow';
  end if;

  insert into public.notifications (user_id, actor_id, kind, drop_id)
  values (p_recipient, p_actor, p_kind, p_drop);
end $$;

create or replace function public.trg_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_primary uuid;
  r record;
begin
  if NEW.parent_id is not null then
    select user_id into v_primary from public.comments where id = NEW.parent_id;
  else
    v_primary := public.drop_author_id(NEW.drop_id);
  end if;

  for r in
    select distinct p.id as uid
      from regexp_matches(NEW.body, '@([A-Za-z0-9_]{2,30})', 'g') as m(handle)
      join public.profiles p on lower(p.username) = lower(m.handle)
     where p.id <> NEW.user_id
       and p.id is distinct from v_primary
  loop
    perform public.emit_notification(r.uid, NEW.user_id, 'mention', NEW.drop_id);
  end loop;
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists comments_mentions on public.comments;
create trigger comments_mentions
  after insert on public.comments
  for each row execute function public.trg_comment_mentions();

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  null; -- already in the publication
end $$;
