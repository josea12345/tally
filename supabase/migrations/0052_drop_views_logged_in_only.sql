-- ============================================================================
-- 0052 — D5 decided (Jose, 2026-10-26): drop views are logged-in only.
-- 0043 let anyone record a view (viewer_id null = anonymous), which made
-- view counts inflatable by anyone technical. Now an insert must be the
-- caller's own view. Existing anonymous rows stay (history), they just
-- can't be created anymore. Client skips tracking when logged out.
-- ============================================================================

drop policy if exists "drop views recordable" on public.drop_views;

create policy "drop views recordable" on public.drop_views
  for insert
  with check (
    viewer_id = auth.uid()
    and exists (select 1 from public.drops d where d.id = drop_id)
  );

revoke insert on public.drop_views from anon;
