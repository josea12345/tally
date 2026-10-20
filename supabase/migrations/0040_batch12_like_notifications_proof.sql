-- ============================================================================
-- 0040 — Batch 12: like notifications + proof verdicts.
-- 1) notifications kind check learns 'like'.
-- 2) emit_notification: 'like' gated by the comments preference, with
--    follow-style dedupe (a re-like refreshes the one alert).
-- 3) trg_comment_like_notify: liking a comment notifies its author.
-- 4) verdicts.proof_url: optional receipt photo on a W/L verdict.
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('W', 'L', 'follow', 'comment', 'approved', 'requested', 'mention', 'like'));

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

create or replace function public.trg_comment_like_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_author uuid;
  v_drop uuid;
begin
  select user_id, drop_id into v_author, v_drop
    from public.comments where id = NEW.comment_id;
  if v_author is not null then
    perform public.emit_notification(v_author, NEW.user_id, 'like', v_drop);
  end if;
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists comment_likes_notify on public.comment_likes;
create trigger comment_likes_notify
  after insert on public.comment_likes
  for each row execute function public.trg_comment_like_notify();

alter table public.verdicts add column if not exists proof_url text;
