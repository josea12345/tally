-- 0014 — Allow the TMDB link chip on drops.

alter table public.drops drop constraint if exists drops_external_label_check;
alter table public.drops
  add constraint drops_external_label_check
  check (external_label in ('IMDb','Rotten Tomatoes','Spotify','Official site','TMDB'));
