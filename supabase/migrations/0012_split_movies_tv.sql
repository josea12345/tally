-- 0012 — Split movies_tv into movies + tv (no existing rows used the old value).

alter table public.drops drop constraint if exists drops_category_check;
alter table public.drops
  add constraint drops_category_check
  check (category in ('food_drink', 'shops', 'places', 'movies', 'tv', 'music', 'recipes'));
