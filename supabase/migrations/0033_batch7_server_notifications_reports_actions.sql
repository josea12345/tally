-- ============================================================================
-- 0033 — Batch 7: server-side notifications (closes audit S6) + reports
-- actions.
-- S6: any authenticated user could INSERT a notification row naming any
--     recipient/actor/kind, forging alerts — and the push trigger would
--     happily deliver them. Fix: clients lose INSERT (and the actor
--     dedupe DELETE) on notifications; SECURITY DEFINER triggers create
--     rows from the real events instead, mirroring the old client
--     semantics exactly (preference gates, W/L replace-on-flip, follow
--     dedupe, vote-retract removes the alert, approval detection via the
--     still-pending follow_requests row). Every trigger body is wrapped
--     so a notification failure can never break the underlying action.
-- ============================================================================

create or replace function public.emit_notification(
  p_recipient uuid,
  p_actor uuid,
  p_kind text,
  p_drop uuid
)
returns void
language plpgsql
security definer
set search_path = public
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
    when p_kind = 'comment' then coalesce(
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

  insert into public.notifications (user_id, actor_id, kind, drop_id)
  values (p_recipient, p_actor, p_kind, p_drop);
end;
$$;

-- Verdicts: vote / flip / retract --------------------------------------------
create or replace function public.trg_verdict_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  begin
    if TG_OP = 'DELETE' then
      v_author := public.drop_author_id(OLD.drop_id);
      if v_author is not null and v_author <> OLD.user_id then
        delete from public.notifications
          where user_id = v_author
            and actor_id = OLD.user_id
            and drop_id = OLD.drop_id
            and kind in ('W', 'L');
      end if;
      return OLD;
    end if;
    if TG_OP = 'UPDATE' and NEW.verdict = OLD.verdict then
      return NEW;
    end if;
    v_author := public.drop_author_id(NEW.drop_id);
    if v_author is not null then
      perform public.emit_notification(v_author, NEW.user_id, NEW.verdict, NEW.drop_id);
    end if;
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists verdicts_notify on public.verdicts;
create trigger verdicts_notify
  after insert or update or delete on public.verdicts
  for each row execute function public.trg_verdict_notify();

-- Comments --------------------------------------------------------------------
create or replace function public.trg_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  begin
    v_author := public.drop_author_id(NEW.drop_id);
    if v_author is not null then
      perform public.emit_notification(v_author, NEW.user_id, 'comment', NEW.drop_id);
    end if;
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.trg_comment_notify();

-- Follows: direct follow, or approval when a request row is still pending ----
create or replace function public.trg_follow_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if exists (
      select 1 from public.follow_requests r
      where r.follower_id = NEW.follower_id
        and r.followee_id = NEW.followee_id
    ) then
      perform public.emit_notification(NEW.follower_id, NEW.followee_id, 'approved', null);
    else
      perform public.emit_notification(NEW.followee_id, NEW.follower_id, 'follow', null);
    end if;
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.trg_follow_notify();

-- Follow requests ---------------------------------------------------------------
create or replace function public.trg_follow_request_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.emit_notification(NEW.followee_id, NEW.follower_id, 'requested', null);
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists follow_requests_notify on public.follow_requests;
create trigger follow_requests_notify
  after insert on public.follow_requests
  for each row execute function public.trg_follow_request_notify();

-- Lock client writes: triggers (definer) bypass RLS; users keep reading,
-- marking read, and deleting their OWN notifications.
drop policy if exists "notifications actor insert" on public.notifications;
drop policy if exists "notifications actor dedupe delete" on public.notifications;

-- Reports: status + admin actions ----------------------------------------------
alter table public.reports
  add column if not exists status text not null default 'open';

alter table public.reports
  drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check check (status in ('open', 'dismissed', 'actioned'));

drop policy if exists "reports admin update" on public.reports;
create policy "reports admin update"
  on public.reports for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "drops admin delete" on public.drops;
create policy "drops admin delete"
  on public.drops for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );
