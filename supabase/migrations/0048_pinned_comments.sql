-- ============================================================================
-- 0048 — Batch 21: pinned comments. The drop's author can pin ONE
-- comment to the top of the thread. Pinning goes through a definer RPC
-- so the author never gains UPDATE rights over other people's text.
-- ============================================================================

alter table public.comments
  add column if not exists pinned boolean not null default false;

create or replace function public.set_comment_pin(p_comment uuid, p_pinned boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_drop uuid;
  v_author uuid;
begin
  select drop_id into v_drop from public.comments where id = p_comment;
  if v_drop is null then
    return false;
  end if;
  select author_id into v_author from public.drops where id = v_drop;
  if v_author is distinct from auth.uid() then
    return false;
  end if;
  if p_pinned then
    update public.comments set pinned = false
     where drop_id = v_drop and pinned and id <> p_comment;
    update public.comments set pinned = true where id = p_comment;
  else
    update public.comments set pinned = false where id = p_comment;
  end if;
  return true;
end $$;

grant execute on function public.set_comment_pin(uuid, boolean) to authenticated;
