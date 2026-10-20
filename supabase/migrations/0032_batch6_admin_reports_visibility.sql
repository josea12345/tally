-- ============================================================================
-- 0032 — Batch 6: admin reports inbox + close audit S7/S8.
-- S7: verdicts/comments/saves were readable via direct API on drops the
--     reader cannot see (private author, or a block in either direction).
-- S8: a blocked user could still insert verdicts/comments/saves on the
--     blocker's drops — blocks only hid the drop rows.
-- Fix: gate every read/write on those tables with can_interact_with_drop(),
-- which is exactly is_drop_visible() applied to the drop's author (covers
-- privacy + follows + both block directions). The 0024 self-vote ban and
-- the 0021/0020 ownership pinning triggers are preserved untouched.
-- ============================================================================

create or replace function public.drop_author_id(p_drop_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select author_id from public.drops where id = p_drop_id;
$$;

create or replace function public.can_interact_with_drop(p_drop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_drop_visible(public.drop_author_id(p_drop_id)), false);
$$;

-- Admin flag (founder inbox). Only Jose's account is flagged.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles
  set is_admin = true
  where id = 'dbb04415-914d-4807-8be3-065179a359d2';

drop policy if exists "reports admin read" on public.reports;
create policy "reports admin read"
  on public.reports for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

-- Verdicts -------------------------------------------------------------------
drop policy if exists "verdicts public read" on public.verdicts;
create policy "verdicts visible read"
  on public.verdicts for select
  using (public.can_interact_with_drop(drop_id));

drop policy if exists "verdicts own insert" on public.verdicts;
create policy "verdicts own insert"
  on public.verdicts for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.drop_author_id(drop_id) is distinct from auth.uid()
    and public.can_interact_with_drop(drop_id)
  );

drop policy if exists "verdicts own update" on public.verdicts;
create policy "verdicts own update"
  on public.verdicts for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.can_interact_with_drop(drop_id)
  );

-- Comments -------------------------------------------------------------------
drop policy if exists "comments public read" on public.comments;
create policy "comments visible read"
  on public.comments for select
  using (public.can_interact_with_drop(drop_id));

drop policy if exists "comments authed insert" on public.comments;
create policy "comments authed insert"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and public.can_interact_with_drop(drop_id)
  );

-- Saves ----------------------------------------------------------------------
drop policy if exists "saves public read" on public.saves;
create policy "saves visible read"
  on public.saves for select
  using (public.can_interact_with_drop(drop_id));

drop policy if exists "saves own insert" on public.saves;
create policy "saves own insert"
  on public.saves for insert
  with check (
    auth.uid() = user_id
    and public.can_interact_with_drop(drop_id)
  );
