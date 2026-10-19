-- PROPOSED — NEEDS JOSE'S APPROVAL. Do not run without approval.
-- 0021 — let an actor delete their own authored vote/follow notifications.
-- Finding S3: notify()/unnotifyVote() (src/lib/notify.ts) run as the ACTOR and
-- DELETE the recipient's earlier W/L/follow rows to dedupe. But
-- "notifications own delete" requires auth.uid() = user_id (the recipient),
-- so those deletes are RLS-blocked and silently fail: flipping W->L stacks
-- notifications and vote retractions never clear the notification. This adds
-- a narrow policy so an actor can delete ONLY rows they authored, for the
-- dedupe kinds only. Recipients' other notifications are untouched.
drop policy if exists "notifications actor dedupe delete" on public.notifications;
create policy "notifications actor dedupe delete"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = actor_id and kind in ('W', 'L', 'follow'));
