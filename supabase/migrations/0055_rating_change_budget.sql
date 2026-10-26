-- 0055: one-change budget for ratings (Jose's rule, 2026-10-26).
-- A rating can be CHANGED at most once; after that it locks.
-- Removal + re-rating is a change too: the spent budget survives the
-- delete via rating_change_spent, so the counter can't be reset by
-- deleting the row. Deleting your account still works — this log
-- cascades away with the profile.
create table if not exists public.rating_change_spent (
  user_id uuid not null references public.profiles(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  spent_at timestamptz not null default now(),
  primary key (user_id, drop_id)
);
alter table public.rating_change_spent enable row level security;
-- No policies: clients never touch this table directly. The trigger
-- below (security definer) is the only writer; the app reads the
-- budget through drop_ratings_with_budget.

create or replace function public.enforce_rating_change_budget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- A re-rate after removing a CHANGED rating spends the budget
    -- again — blocked. (A re-rate after removing an UNCHANGED rating
    -- is still just the first rating; nothing was ever changed.)
    if exists (
      select 1 from public.rating_change_spent s
      where s.user_id = new.user_id and s.drop_id = new.drop_id
    ) then
      raise exception 'rating change budget already spent for this drop';
    end if;
    return new;
  end if;
  -- UPDATE: only a real score change spends the budget.
  if new.score is distinct from old.score then
    insert into public.rating_change_spent (user_id, drop_id)
    values (old.user_id, old.drop_id)
    on conflict (user_id, drop_id) do nothing;
    if not found then
      raise exception 'rating already changed once — ratings lock after one change';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists drop_ratings_change_budget on public.drop_ratings;
create trigger drop_ratings_change_budget
  before insert or update on public.drop_ratings
  for each row execute function public.enforce_rating_change_budget();

-- Read view: every rating row plus whether its owner already spent
-- their one change on it. security_invoker keeps base-table RLS in
-- charge; the spent flag is derived per row owner.
create or replace view public.drop_ratings_with_budget
  with (security_invoker = true) as
select r.*,
       exists (
         select 1 from public.rating_change_spent s
         where s.user_id = r.user_id and s.drop_id = r.drop_id
       ) as change_spent
from public.drop_ratings r;
grant select on public.drop_ratings_with_budget to anon, authenticated;
