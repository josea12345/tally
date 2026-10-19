-- ============================================================================
-- PROPOSED MIGRATION — NEEDS JOSE'S APPROVAL — NOT APPLIED
-- Round-2 follow-up to 0022 (Worker B, 2026-10-19)
--
-- Problem: 0022's block checks use plain NOT EXISTS subqueries against
-- public.blocks. But the only blocks SELECT policy ("blocks own all") is
-- `USING (auth.uid() = blocker_id)` — a user can only see rows where THEY
-- are the blocker. So when a BLOCKED user tries to follow the blocker's
-- public account (or request their private one), the block row is invisible
-- to them, NOT EXISTS evaluates true, and the insert SUCCEEDS. 0022 therefore
-- delivers only the "I blocked them" direction, not the "they blocked me"
-- direction — the exact scenario 0022's item-5 comment claims to fix.
--
-- Fix: a SECURITY DEFINER helper (same pattern as is_drop_visible in 0016)
-- that sees the blocks table regardless of the caller's RLS, and rewire the
-- two 0022 policies to call it instead of the half-blind subqueries.
-- Tightens only; nothing loosened. The approval-path EXISTS logic from 0022
-- is preserved byte-for-byte.
-- ============================================================================

create or replace function public.blocks_involve(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Follows: same two branches as 0022, block checks now definer-based.
drop policy if exists "follows insert" on public.follows;
create policy "follows insert"
  on public.follows for insert to authenticated
  with check (
    (
      auth.uid() = follower_id
      and not exists (
        select 1 from public.profiles p
        where p.id = followee_id and p.is_private
      )
      and not public.blocks_involve(auth.uid(), followee_id)
    )
    or (
      auth.uid() = followee_id
      and exists (
        select 1 from public.follow_requests r
        where r.follower_id = follower_id
          and r.followee_id = followee_id
      )
      and not public.blocks_involve(follower_id, followee_id)
    )
  );

-- Follow requests: same rule as 0022, block check now definer-based.
drop policy if exists "follow_requests request" on public.follow_requests;
create policy "follow_requests request"
  on public.follow_requests for insert to authenticated
  with check (
    auth.uid() = follower_id
    and exists (
      select 1 from public.profiles p
      where p.id = followee_id and p.is_private
    )
    and not public.blocks_involve(auth.uid(), followee_id)
  );

-- ----------------------------------------------------------------------------
-- Verify AFTER applying (needs two test accounts; do NOT run against prod):
--   1. A blocks B → B's follow of public A is REJECTED by RLS.
--   2. A blocks B → B's follow-request to private A is REJECTED by RLS.
--   3. Normal follow of a public account still works; private request +
--      approval still works (request row must exist before the follows insert).
--   4. `select public.blocks_involve('<a>'::uuid, '<b>'::uuid);` returns true
--      iff a block row exists in either direction (callable by any authed user;
--      reveals only existence between two ids, no row contents).
-- Caveat: the helper reveals block-pair existence to any authenticated caller
-- that can guess two user ids. That is the minimum needed for the check and
-- matches the is_drop_visible precedent; user ids are already public.
-- ----------------------------------------------------------------------------
