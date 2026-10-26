-- ============================================================================
-- 0053 — Posted lists: ordering + mountain likes.
-- Lists ARE collections (0041). Two additions:
--   1. collection_items.position — the owner's intended order. Existing
--      rows backfill by added_at so every current list has a stable order;
--      the pages read position first, added_at as tiebreak.
--   2. collection_likes — the list's ONLY social signal (Jose's call,
--      2026-10-26): lists are never rated (no 0–10), never get a Try-all
--      or a share affordance; a mountain like + its count is how a list
--      shows popularity. One like per user; owners can't like their own.
-- ============================================================================

alter table public.collection_items
  add column if not exists position integer not null default 0;

with ranked as (
  select collection_id, drop_id,
         row_number() over (partition by collection_id order by added_at) - 1 as rn
    from public.collection_items
)
update public.collection_items ci
   set position = ranked.rn
  from ranked
 where ranked.collection_id = ci.collection_id
   and ranked.drop_id = ci.drop_id;

create table if not exists public.collection_likes (
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create index if not exists collection_likes_collection_idx
  on public.collection_likes (collection_id);

alter table public.collection_likes enable row level security;

-- Counts are public (that's the point of a popularity signal), but the
-- liked list itself still has to be visible to the reader.
create policy "list likes visible read" on public.collection_likes
  for select
  using (exists (
    select 1 from public.collections c
     where c.id = collection_id and (c.is_public or c.owner_id = auth.uid())
  ));

create policy "list likes own insert" on public.collection_likes
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.collections c
       where c.id = collection_id
         and c.is_public
         and c.owner_id <> auth.uid()
    )
  );

create policy "list likes own delete" on public.collection_likes
  for delete
  using (user_id = auth.uid());

grant select, insert, delete on public.collection_likes to authenticated;
grant select on public.collection_likes to anon;
