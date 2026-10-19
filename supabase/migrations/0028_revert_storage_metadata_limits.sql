-- 0028: revert the metadata-based storage limits from 0023/0026.
--
-- Root cause (proven live 2026-10-19): Supabase populates
-- storage.objects.metadata (size, mimetype, …) AFTER the INSERT row-level
-- security check runs — existing rows all carry full metadata, yet every new
-- upload was rejected with "new row violates row-level security policy"
-- because at check time metadata->>'size' / metadata->>'mimetype' are NULL
-- and NULL <= limit / NULL LIKE 'image/%' is not TRUE.
--
-- A metadata predicate on the INSERT path can therefore never pass, for good
-- files or bad ones. These policies restore the pre-0023 bucket + own-folder
-- checks. Size/type enforcement stays client-side (MediaUpload: 20 MB +
-- image/video-only for drop-media; Profile: 5 MB + image-only for avatars),
-- which is where it already ran before the audit.
--
-- If server-side enforcement is ever wanted, it cannot be an INSERT-time
-- metadata predicate — it would need a post-upload sweep, not RLS.

drop policy if exists "drop-media own insert" on storage.objects;
create policy "drop-media own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars own insert" on storage.objects;
create policy "avatars own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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
  );

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
  );
