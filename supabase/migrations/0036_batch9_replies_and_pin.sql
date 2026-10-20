-- ============================================================================
-- 0036 — Batch 9: comment replies + signature put-on.
-- 1) comments.parent_id (one level of threading; replies to replies hang
--    off the top-level comment, enforced client-side).
-- 2) trg_comment_notify: a reply notifies the parent comment's author;
--    a top-level comment still notifies the drop's author.
-- 3) profiles.pinned_drop_id: the author's signature put-on, showcased
--    at the top of their profile.
-- ============================================================================

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);

alter table public.profiles
  add column if not exists pinned_drop_id uuid references public.drops(id) on delete set null;

create or replace function public.trg_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_recipient uuid;
begin
  if NEW.parent_id is not null then
    select user_id into v_recipient from public.comments where id = NEW.parent_id;
  else
    v_recipient := public.drop_author_id(NEW.drop_id);
  end if;
  perform public.emit_notification(v_recipient, NEW.user_id, 'comment', NEW.drop_id);
  return NEW;
exception when others then
  return NEW;
end $$;
