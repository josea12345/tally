-- ============================================================================
-- PROPOSED MIGRATION — NEEDS JOSE'S APPROVAL — NOT APPLIED
-- Round-2 follow-up to 0023 (Worker B, 2026-10-19)
--
-- Problem: 0023 tightened only the storage INSERT policies. The pre-existing
-- UPDATE policies (0001 "drop-media own update", 0008 "avatars own update")
-- still check bucket + own-folder only. The avatar flow uses `upsert: true`
-- to the fixed path {uid}/avatar.jpg, so every avatar change AFTER the first
-- takes the storage UPDATE path and bypasses the 5 MB / image-type limits.
-- Anyone calling the storage update API directly can likewise overwrite their
-- own existing object with arbitrary bytes/sizes. (0023's "upsert-overwrite
-- re-checks" comment is incorrect for the update path.)
--
-- Fix: mirror the 0023 size/type predicates onto the WITH CHECK of both
-- UPDATE policies. USING is deliberately left as bucket + own-folder only:
-- old objects uploaded before any limits existed must remain overwritable
-- (otherwise their owners could never replace them with compliant files).
-- Fail-closed like 0023: missing/non-numeric size → cast fails → rejected.
-- ----------------------------------------------------------------------------

-- drop-media update: <= 20 MB, image/* or video/* (mirrors 0023 insert).
drop policy if exists "drop-media own update" on storage.objects;
create policy "drop-media own update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (metadata ->> 'size')::bigint <= 20971520
    and (
      (metadata ->> 'mimetype') like 'image/%'
      or (metadata ->> 'mimetype') like 'video/%'
    )
  );

-- avatars update: <= 5 MB, image/* (mirrors 0023 insert).
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (metadata ->> 'size')::bigint <= 5242880
    and (metadata ->> 'mimetype') like 'image/%'
  );

-- ----------------------------------------------------------------------------
-- Verify AFTER applying (coordinate with Jose; staging or his own device):
--   1. Normal avatar change (upsert to existing avatar.jpg) still works for a
--      compliant image <= 5 MB.
--   2. A direct storage UPDATE overwriting one's own object with a >5 MB file
--      (avatars) or >20 MB file (drop-media) is rejected by RLS.
--   3. Uploads/updates to another user's folder still rejected (unchanged).
-- Caveat: assumes Supabase refreshes storage.objects.metadata on update with
-- the new object's metadata (true for update/upsert via the storage API).
-- The mimetype predicate remains client-declared (soft); the size predicate
-- is server-measured (hard).
-- ----------------------------------------------------------------------------
