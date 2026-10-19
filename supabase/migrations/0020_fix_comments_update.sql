-- PROPOSED — NEEDS JOSE'S APPROVAL. Do not run without approval.
-- 0019 — comments: pin user_id + drop_id on UPDATE.
-- Finding S1: "comments own update" has USING but no WITH CHECK, so via direct
-- API calls an authenticated user could re-attribute their own comment to
-- another user (SET user_id = <someone else>) or move it onto someone else's
-- drop (SET drop_id = <other drop>). The policy below locks the new row's
-- user_id; the trigger pins both user_id and drop_id (policies cannot compare
-- new vs old values). Safe for the app: Comments.tsx only ever updates body
-- (via delete+repost for removal; touch_updated_at still fires normally).
drop policy if exists "comments own update" on public.comments;
create policy "comments own update"
  on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.comments_pin_ownership()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id
     or new.drop_id is distinct from old.drop_id then
    raise exception 'comments: user_id and drop_id are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_pin_ownership on public.comments;
create trigger comments_pin_ownership
  before update on public.comments
  for each row execute function public.comments_pin_ownership();
