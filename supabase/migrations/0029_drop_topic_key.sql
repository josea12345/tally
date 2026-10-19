-- 0029: topic_key on drops — powers "all posts about this place/movie".
--
-- A drop's topic is its shareable subject: the IMDb id for movies/TV when
-- known (exact), otherwise the normalized title (+ city for local
-- categories, which are city-scoped). The client computes the same key via
-- topicKeyFor() in src/lib/format.ts and stores it at post time; this
-- backfills existing rows with the identical rule. Indexed for the topic
-- page query. RLS: drops policies don't restrict columns, so it flows
-- through the author's own insert/update.

alter table public.drops add column topic_key text null;

create index if not exists drops_topic_key_idx on public.drops (topic_key);

update public.drops
set topic_key = case
  when imdb_id is not null and imdb_id <> '' then 'imdb:' || imdb_id
  when category in ('food_drink', 'shops', 'places')
    then 'title:' || lower(trim(title)) || '|' || lower(trim(coalesce(city, '')))
  else 'title:' || lower(trim(title)) || '|'
end
where topic_key is null;
