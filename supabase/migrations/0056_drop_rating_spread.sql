-- 0056: per-drop rating spread for the Most Contested rail.
-- stddev over drop_ratings; the rail requires n >= 3 client-side.
create or replace view public.drop_rating_spread
  with (security_invoker = true) as
select drop_id,
       count(*)::int as n,
       min(score) as lo,
       max(score) as hi,
       avg(score) as avg,
       stddev_pop(score) as std
from public.drop_ratings
group by drop_id;
grant select on public.drop_rating_spread to anon, authenticated;
