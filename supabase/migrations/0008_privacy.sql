-- ============================================================================
-- 0008 — Privacy: private accounts, follow requests, avatars bucket
-- ============================================================================

-- 1. Private flag on profiles (default: public, as before)
alter table public.profiles
  add column if not exists is_private boolean not null default false;

-- 2. Visibility helper: can the current viewer see this author's drops?
create or replace function public.is_drop_visible(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.profiles p
      where p.id = p_author_id and p.is_private
    )
    or p_author_id = auth.uid()
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.followee_id = p_author_id
    );
$$;

-- 3. Drops: public read becomes visibility-aware read
drop policy if exists "drops public read" on public.drops;
drop policy if exists "drops readable" on public.drops;
create policy "drops readable"
  on public.drops for select
  using (public.is_drop_visible(author_id));

-- 4. Follow requests (for private accounts)
create table if not exists public.follow_requests (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table public.follow_requests enable row level security;

drop policy if exists "follow_requests visible" on public.follow_requests;
create policy "follow_requests visible"
  on public.follow_requests for select
  using (auth.uid() = follower_id or auth.uid() = followee_id);

drop policy if exists "follow_requests request" on public.follow_requests;
create policy "follow_requests request"
  on public.follow_requests for insert to authenticated
  with check (
    auth.uid() = follower_id
    and exists (
      select 1 from public.profiles p
      where p.id = followee_id and p.is_private
    )
  );

drop policy if exists "follow_requests manage" on public.follow_requests;
create policy "follow_requests manage"
  on public.follow_requests for delete
  using (auth.uid() = follower_id or auth.uid() = followee_id);

-- 5. Follows: direct follow only for public accounts; private follows via approval
drop policy if exists "follows own insert" on public.follows;
drop policy if exists "follows insert" on public.follows;
create policy "follows insert"
  on public.follows for insert to authenticated
  with check (
    (
      auth.uid() = follower_id
      and not exists (
        select 1 from public.profiles p
        where p.id = followee_id and p.is_private
      )
    )
    or auth.uid() = followee_id -- the followee approving a request
  );

-- --------------------------------------------------------------------------
-- Storage: avatars bucket (public read; authenticated write to own paths)
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars own insert" on storage.objects;
create policy "avatars own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars own delete" on storage.objects;
create policy "avatars own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
