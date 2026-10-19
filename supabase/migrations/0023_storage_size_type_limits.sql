-- ============================================================================
-- PROPOSED MIGRATION — NEEDS APPROVAL — NOT APPLIED
-- Audit item 11 (Worker A, 2026-10-19)
--
-- Problem: neither storage bucket enforces file-type or file-size SERVER-side.
-- drop-media: client caps at 20 MB + image/video-only (MediaUpload.tsx), but a
-- client can upload ANY bytes (e.g. a 2 GB .exe) into their own folder —
-- policies check only bucket + own-folder path. avatars: client had NO checks
-- at all until the audit (now image/* + 5 MB client-side, Profile.tsx).
--
-- Fix: TIGHTEN the insert policies with server-measured size and the
-- client-declared mimetype. Notes:
--   * (metadata->>'size') is populated by Supabase at upload (bytes).
--   * (metadata->>'mimetype') comes from the client's contentType header, so
--     it is a soft check (defense in depth, not a guarantee). The size check
--     is the hard one.
--   * The own-folder path requirement is preserved unchanged.
--   * Update policies are left as-is (update keeps the same object; the
--     avatar flow uses upsert which is insert-or-update — the insert policy
--     governs new objects; upsert-overwrite of avatar.jpg re-checks).
-- ============================================================================

-- drop-media: <= 20 MB, image/* or video/* (matches MediaUpload client rules).
drop policy if exists "drop-media own insert" on storage.objects;
create policy "drop-media own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (metadata ->> 'size')::bigint <= 20971520
    and (
      (metadata ->> 'mimetype') like 'image/%'
      or (metadata ->> 'mimetype') like 'video/%'
    )
  );

-- avatars: <= 5 MB, image/* (matches the new Profile.tsx client checks).
drop policy if exists "avatars own insert" on storage.objects;
create policy "avatars own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (metadata ->> 'size')::bigint <= 5242880
    and (metadata ->> 'mimetype') like 'image/%'
  );

-- ---------------------------------------------------------------------------
-- Verify AFTER applying (coordinate with Jose; staging or his own device):
--   1. Normal photo/video upload (MediaUpload) and avatar upload still work.
--   2. A direct storage upload of a >20 MB file to drop-media/<own-uid>/ is
--      rejected by RLS; >5 MB or non-image to avatars/<own-uid>/ is rejected.
--   3. Uploads to another user's folder are still rejected (unchanged).
-- Caveat: metadata->>'mimetype' is client-declared — treat as soft signal.
-- ---------------------------------------------------------------------------
