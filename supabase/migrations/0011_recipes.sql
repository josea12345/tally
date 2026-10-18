-- 0011 — Recipes: new category + ingredient / instruction lists.
-- Recipes are global (like movies/tv/music), not location-bound.

alter table public.drops drop constraint if exists drops_category_check;
alter table public.drops
  add constraint drops_category_check
  check (category in ('food_drink', 'shops', 'places', 'movies_tv', 'music', 'recipes'));

alter table public.drops
  add column if not exists ingredients text[] not null default '{}',
  add column if not exists instructions text[] not null default '{}';
