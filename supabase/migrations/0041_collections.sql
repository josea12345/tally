-- ============================================================================
-- 0041 — Collections (lists): named, shareable lists of drops.
-- Public by default; the owner can make a list private. Items inherit
-- drop visibility at read time (the drops policies still apply).
-- ============================================================================

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists collections_owner_idx
  on public.collections (owner_id, created_at desc);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, drop_id)
);

create index if not exists collection_items_drop_idx
  on public.collection_items (drop_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

create policy "collections visible read" on public.collections
  for select
  using (is_public or owner_id = auth.uid());

create policy "collections owner insert" on public.collections
  for insert
  with check (owner_id = auth.uid());

create policy "collections owner update" on public.collections
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "collections owner delete" on public.collections
  for delete
  using (owner_id = auth.uid());

create policy "collection items visible read" on public.collection_items
  for select
  using (exists (
    select 1 from public.collections c
     where c.id = collection_id and (c.is_public or c.owner_id = auth.uid())
  ));

create policy "collection items owner insert" on public.collection_items
  for insert
  with check (exists (
    select 1 from public.collections c
     where c.id = collection_id and c.owner_id = auth.uid()
  ));

create policy "collection items owner delete" on public.collection_items
  for delete
  using (exists (
    select 1 from public.collections c
     where c.id = collection_id and c.owner_id = auth.uid()
  ));

grant select, insert, update, delete on public.collections to authenticated;
grant select on public.collections to anon;
grant select, insert, delete on public.collection_items to authenticated;
grant select on public.collection_items to anon;
