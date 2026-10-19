-- 0030: Spotify popularity on drops (music) — the IMDb-rating analog.
-- Set by the composer when a track is picked via Spotify search; shown as a
-- "Spotify N" badge next to the author's score. Nullable: manual-entry music
-- drops and all other categories leave it null.

alter table public.drops add column spotify_popularity int null;
