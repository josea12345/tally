-- ============================================================================
-- 0043 — Batch 15: drop view tracking (author insights) + verdict notes.
-- drop_views is append-only; only a drop's author can read its views.
-- ============================================================================

create table if not exists public.drop_views (
  id bigint generated always as identity primary key,
  drop_id uuid not null references public.drops(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists drop_views_drop_idx
  on public.drop_views (drop_id, created_at desc);

alter table public.drop_views enable row level security;

create policy "drop views recordable" on public.drop_views
  for insert
  with check (
    (viewer_id is null or viewer_id = auth.uid())
    and exists (select 1 from public.drops d where d.id = drop_id)
  );

create policy "drop views author read" on public.drop_views
  for select
  using (exists (
    select 1 from public.drops d
     where d.id = drop_id and d.author_id = auth.uid()
  ));

grant insert on public.drop_views to authenticated, anon;
grant select on public.drop_views to authenticated;

alter table public.verdicts
  add column if not exists note text
    check (note is null or char_length(note) <= 140);
