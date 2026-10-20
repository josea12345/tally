-- ============================================================================
-- 0046 — Batch 19: topic follows + @mentions in drop descriptions notify.
-- ============================================================================

create table if not exists public.topic_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_key)
);

alter table public.topic_follows enable row level security;

create policy "topic follows own read" on public.topic_follows
  for select using (user_id = auth.uid());
create policy "topic follows own insert" on public.topic_follows
  for insert with check (user_id = auth.uid());
create policy "topic follows own delete" on public.topic_follows
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.topic_follows to authenticated;

create or replace function public.trg_drop_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  m text;
  v_uid uuid;
  seen uuid[] := '{}';
begin
  if NEW.description is null or NEW.description = '' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.description is not distinct from OLD.description then
    return NEW;
  end if;
  for m in
    select (regexp_matches(NEW.description, '(?:^|[^A-Za-z0-9_.])@([A-Za-z0-9_.]{2,30})', 'g'))[1]
  loop
    select id into v_uid from public.profiles where lower(username) = lower(m) limit 1;
    if v_uid is not null and v_uid <> NEW.author_id and not (v_uid = any(seen)) then
      seen := array_append(seen, v_uid);
      perform public.emit_notification(v_uid, NEW.author_id, 'mention', NEW.id);
    end if;
  end loop;
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists drops_mentions on public.drops;
create trigger drops_mentions
  after insert or update of description on public.drops
  for each row execute function public.trg_drop_mentions();
