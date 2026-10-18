-- 0015 — Real IMDb data on drops: exact IMDb id + rating.

alter table public.drops add column if not exists imdb_id text;
alter table public.drops add column if not exists imdb_rating numeric;
