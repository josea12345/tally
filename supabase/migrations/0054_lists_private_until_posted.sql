-- ============================================================================
-- 0054 — Lists are private until posted (Jose's call, 2026-10-26).
-- A list starts life private; only the owner's explicit Post action
-- (is_public = true from the list page) puts it in the Lists section.
-- Existing lists flip back to private too: nothing is public that
-- wasn't posted under this rule.
-- ============================================================================

alter table public.collections alter column is_public set default false;

update public.collections set is_public = false where is_public = true;
