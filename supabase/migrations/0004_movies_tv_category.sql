-- 0004: merge movies/tv into a single movies_tv category.
-- Production has no drops yet, but migrate any existing rows anyway.
alter table public.drops drop constraint if exists drops_category_check;

update public.drops
  set category = 'movies_tv'
  where category in ('movies', 'tv');

alter table public.drops
  add constraint drops_category_check
  check (category in ('food_drink', 'shops', 'places', 'movies_tv', 'music'));
