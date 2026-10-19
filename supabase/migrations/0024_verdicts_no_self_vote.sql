-- PROPOSED — NEEDS JOSE'S APPROVAL. Do not run without approval.
-- 0023 — block self-votes at the database level.
-- Finding S5: nothing stops a user from voting W on their own drops, and
-- Profile.tsx's Taste Score counts ALL verdicts received (including
-- self-votes), so authors can inflate their own score. This rejects verdict
-- inserts on drops the voter authored. PRODUCT DECISION: the app currently
-- permits self-voting (VerdictBox.tsx has no self check), so applying this
-- changes UX — self-vote attempts will start failing. If approved, also add
-- a client-side guard in VerdictBox for a clean error.
drop policy if exists "verdicts own insert" on public.verdicts;
create policy "verdicts own insert"
  on public.verdicts for insert to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.drops d
      where d.id = drop_id and d.author_id = auth.uid()
    )
  );
