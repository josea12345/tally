-- Carousel: a drop can carry up to 10 media items (photos / videos).
-- Arrays keep the drop row self-contained; position = array order (item 1 = cover).
-- Backfills existing single-media drops so nothing already posted breaks.

alter table public.drops
  add column if not exists media_urls text[] not null default '{}',
  add column if not exists media_types text[] not null default '{}',
  add column if not exists media_poster_urls text[] not null default '{}';

update public.drops
set media_urls = array[media_url],
    media_types = array[media_type],
    media_poster_urls = array[media_poster_url]
where media_url is not null
  and coalesce(array_length(media_urls, 1), 0) = 0;

-- Legacy single-media columns stay for now (read fallback); a later
-- migration drops them once every client reads the arrays.
