-- PROPOSED — NEEDS JOSE'S APPROVAL. Do not run without approval.
-- 0022 — harden the "follows insert" policy (merge of two audit findings).
--
-- Finding S4 (Worker B): the followee-approval branch (auth.uid() = followee_id)
-- required NO follow_request row, so anyone could insert
-- (follower_id = <anyone>, followee_id = self) — forging follower relationships
-- and bypassing the private-account request flow (private-drop access without
-- a request).
--
-- Finding (Worker A, item 5): the follows and follow_requests INSERT policies
-- never consulted public.blocks, so a blocked user could still follow the
-- blocker's public account or send a follow request to their private account —
-- generating "X followed you / requested to follow you" notifications from
-- someone they blocked.
--
-- Fix (tightens only; nothing loosened):
--   1. Follower branch: unchanged rules + no block in either direction.
--   2. Followee-approval branch: now REQUIRES a live follow_requests row
--      (follower_id, followee_id) + no block in either direction.
--   3. follow_requests inserts: unchanged rules + no block in either direction.
--
-- Compatibility (verified in code 2026-10-19):
--   - FollowButton.tsx inserts as the follower -> branch 1.
--   - Settings.tsx approve() inserts the follow BEFORE deleting the request
--     -> branch 2's EXISTS check passes.
--   - Settings.tsx "going public" inserts all pending follows BEFORE deleting
--     requests -> branch 2 passes for each.
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
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = followee_id)
           or (b.blocker_id = followee_id and b.blocked_id = auth.uid())
      )
    )
    or (
      auth.uid() = followee_id
      and exists (
        select 1 from public.follow_requests r
        where r.follower_id = follower_id
          and r.followee_id = followee_id
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = follower_id and b.blocked_id = followee_id)
           or (b.blocker_id = followee_id and b.blocked_id = follower_id)
      )
    )
  );

drop policy if exists "follow_requests request" on public.follow_requests;
create policy "follow_requests request"
  on public.follow_requests for insert to authenticated
  with check (
    auth.uid() = follower_id
    and exists (
      select 1 from public.profiles p
      where p.id = followee_id and p.is_private
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = followee_id)
         or (b.blocker_id = followee_id and b.blocked_id = auth.uid())
    )
  );

-- Verify AFTER applying (two test users; do not run against production data):
--   1. Normal follow of a public account still works.
--   2. Follow request to a private account still works; approval still works.
--   3. INSERT follows (follower_id=<victim>, followee_id=self) with NO
--      follow_requests row is rejected by RLS.
--   4. A blocks B -> B cannot follow A, A cannot follow B, B cannot request
--      to follow private A, and A cannot request to follow private B.
