-- 0058: a drop can carry the specific place it was pinned from
-- (Photon/ArcGIS suggestion id). Topic identity for place-picked
-- drops becomes place:<id>, so two locations of the same chain in
-- the same city stop merging into one topic page. Unpinned drops
-- keep the title|city key — nothing to backfill, the id was never
-- captured for them.
alter table public.drops add column if not exists place_id text null;
create index if not exists drops_place_id_idx
  on public.drops (place_id) where place_id is not null;
