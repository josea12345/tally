-- ============================================================================
-- 0038 — Fix trg_comment_mentions: regexp_matches yields text[] per match;
-- compare against element [1] (0037 compared the array itself, which threw
-- and was swallowed by the trigger's exception guard, so no mention ever
-- fired — probe-verified 2026-10-20).
-- ============================================================================

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
      from (select (regexp_matches(NEW.body, '@([A-Za-z0-9_]{2,30})', 'g'))[1] as handle) m
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
