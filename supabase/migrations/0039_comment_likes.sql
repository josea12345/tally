-- ============================================================================
-- 0039 — Comment likes: one like per user per comment.
-- Policies mirror comments': read/insert gated on being able to interact
-- with the parent comment's drop; delete is own-rows only (unlike).
-- ============================================================================

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

create policy "comment likes visible read" on public.comment_likes
  for select
  using (exists (
    select 1 from public.comments c
     where c.id = comment_id and public.can_interact_with_drop(c.drop_id)
  ));

create policy "comment likes authed insert" on public.comment_likes
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.comments c
       where c.id = comment_id and public.can_interact_with_drop(c.drop_id)
    )
  );

create policy "comment likes own delete" on public.comment_likes
  for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.comment_likes to authenticated;
grant select on public.comment_likes to anon;
