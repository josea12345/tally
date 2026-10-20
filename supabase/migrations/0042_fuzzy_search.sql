-- ============================================================================
-- 0042 — Fuzzy drop search: pg_trgm similarity over title/description/city.
-- The RPC is SECURITY INVOKER (the default) so drops RLS still applies.
-- ============================================================================

create extension if not exists pg_trgm;

create index if not exists drops_search_trgm_idx
  on public.drops
  using gin ((title || ' ' || coalesce(description, '') || ' ' || coalesce(city, '')) gin_trgm_ops);

create or replace function public.search_drops_fuzzy(q text)
returns table (id uuid, sim real)
language sql
stable
as $$
  select
    d.id,
    word_similarity(q, d.title || ' ' || coalesce(d.description, '') || ' ' || coalesce(d.city, '')) as sim
  from public.drops d
  where d.title ilike '%' || q || '%'
     or d.description ilike '%' || q || '%'
     or coalesce(d.city, '') ilike '%' || q || '%'
     or word_similarity(q, d.title || ' ' || coalesce(d.description, '') || ' ' || coalesce(d.city, '')) > 0.3
  order by sim desc, d.created_at desc
  limit 40
$$;

grant execute on function public.search_drops_fuzzy(text) to authenticated, anon;
