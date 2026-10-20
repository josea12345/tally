-- ============================================================================
-- 0044 — Comment reports: reports gain a comment target.
-- ============================================================================

alter table public.reports
  add column if not exists comment_id uuid
    references public.comments(id) on delete cascade;

alter table public.reports drop constraint if exists reports_target;
alter table public.reports
  add constraint reports_target
  check (drop_id is not null or reported_user_id is not null or comment_id is not null);

-- Admins can delete reported comments (mirrors "drops admin delete", 0033).
drop policy if exists "comments admin delete" on public.comments;
create policy "comments admin delete"
  on public.comments for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );
