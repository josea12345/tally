-- 0007: poster/cover image for video drops (user-picked frame).
alter table public.drops
  add column if not exists media_poster_url text;
