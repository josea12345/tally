-- 0003: merge restaurants/cafes/bars into a single food_drink category.
-- Production has no drops yet, but migrate any existing rows anyway.
alter table public.drops drop constraint if exists drops_category_check;

update public.drops
  set category = 'food_drink'
  where category in ('restaurants', 'cafes', 'bars');

alter table public.drops
  add constraint drops_category_check
  check (category in ('food_drink', 'shops', 'places', 'movies', 'tv', 'music'));
