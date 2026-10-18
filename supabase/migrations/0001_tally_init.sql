-- ============================================================================
-- TALLY — initial schema (0001)
-- Run this whole file in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is idempotent: safe to re-run.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Extensions
-- --------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- profiles
-- One row per auth user. Auto-created by trigger below with a placeholder
-- username; the app's onboarding replaces it with the user's chosen handle.
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  bio text,
  city text not null default 'Miami',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_lower check (username = lower(username)),
  constraint username_len check (char_length(username) between 3 and 20),
  constraint username_format check (username ~ '^[a-z0-9_]+$')
);

create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists profiles_city_idx on public.profiles (city);

-- Auto-create a profile row on signup (runs as definer, bypasses RLS).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, city)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8), 'Miami')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- drops ("recommendations")
-- --------------------------------------------------------------------------
create table if not exists public.drops (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null
    constraint drops_category_check
    check (category in ('restaurants','cafes','bars','shops','places','movies','tv','music')),
  title text not null,
  description text not null,
  city text,
  neighborhood text,
  street_address text,
  latitude double precision,
  longitude double precision,
  maps_url text,
  media_url text,
  media_type text
    constraint drops_media_type_check
    check (media_type in ('photo','video')),
  external_url text,
  external_label text
    constraint drops_external_label_check
    check (external_label in ('IMDb','Rotten Tomatoes','Spotify','Official site')),
  tip text,
  where_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drops_title_len check (char_length(title) between 1 and 160),
  constraint drops_description_len check (char_length(description) between 1 and 600)
);

create index if not exists drops_created_idx on public.drops (created_at desc);
create index if not exists drops_author_idx on public.drops (author_id);
create index if not exists drops_category_idx on public.drops (category);
create index if not exists drops_city_idx on public.drops (city);

drop trigger if exists drops_touch on public.drops;
create trigger drops_touch
  before update on public.drops
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- saves
-- --------------------------------------------------------------------------
create table if not exists public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saves_unique unique (user_id, drop_id)
);

create index if not exists saves_drop_idx on public.saves (drop_id);
create index if not exists saves_user_idx on public.saves (user_id);

-- --------------------------------------------------------------------------
-- verdicts
-- tried-gate: a verdict only counts when tried = true.
-- One current verdict per user per drop (upsert on conflict).
-- --------------------------------------------------------------------------
create table if not exists public.verdicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  tried boolean not null default false,
  verdict text
    constraint verdicts_verdict_check
    check (verdict in ('HIT','MISS')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verdicts_unique unique (user_id, drop_id)
);

create index if not exists verdicts_drop_idx on public.verdicts (drop_id);
create index if not exists verdicts_user_idx on public.verdicts (user_id);
create index if not exists verdicts_created_idx on public.verdicts (created_at desc);

drop trigger if exists verdicts_touch on public.verdicts;
create trigger verdicts_touch
  before update on public.verdicts
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- follows
-- --------------------------------------------------------------------------
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_unique unique (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_followee_idx on public.follows (followee_id);

-- --------------------------------------------------------------------------
-- Row Level Security
-- Ownership is enforced in the database, not just the frontend.
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.drops enable row level security;
alter table public.saves enable row level security;
alter table public.verdicts enable row level security;
alter table public.follows enable row level security;

-- profiles: public read; users can insert/update only their own row.
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select using (true);

drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- drops: public read; authors manage only their own drops.
drop policy if exists "drops public read" on public.drops;
create policy "drops public read"
  on public.drops for select using (true);

drop policy if exists "drops own insert" on public.drops;
create policy "drops own insert"
  on public.drops for insert with check (auth.uid() = author_id);

drop policy if exists "drops own update" on public.drops;
create policy "drops own update"
  on public.drops for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "drops own delete" on public.drops;
create policy "drops own delete"
  on public.drops for delete using (auth.uid() = author_id);

-- saves: public read (counts are social proof); users manage only their own.
drop policy if exists "saves public read" on public.saves;
create policy "saves public read"
  on public.saves for select using (true);

drop policy if exists "saves own insert" on public.saves;
create policy "saves own insert"
  on public.saves for insert with check (auth.uid() = user_id);

drop policy if exists "saves own delete" on public.saves;
create policy "saves own delete"
  on public.saves for delete using (auth.uid() = user_id);

-- verdicts: public read (transparent tallies); users manage only their own.
drop policy if exists "verdicts public read" on public.verdicts;
create policy "verdicts public read"
  on public.verdicts for select using (true);

drop policy if exists "verdicts own insert" on public.verdicts;
create policy "verdicts own insert"
  on public.verdicts for insert with check (auth.uid() = user_id);

drop policy if exists "verdicts own update" on public.verdicts;
create policy "verdicts own update"
  on public.verdicts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "verdicts own delete" on public.verdicts;
create policy "verdicts own delete"
  on public.verdicts for delete using (auth.uid() = user_id);

-- follows: public read (social graph); users manage only their own follows.
drop policy if exists "follows public read" on public.follows;
create policy "follows public read"
  on public.follows for select using (true);

drop policy if exists "follows own insert" on public.follows;
create policy "follows own insert"
  on public.follows for insert with check (auth.uid() = follower_id);

drop policy if exists "follows own delete" on public.follows;
create policy "follows own delete"
  on public.follows for delete using (auth.uid() = follower_id);

-- --------------------------------------------------------------------------
-- Storage: drop-media bucket (public read; authenticated write to own paths)
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('drop-media', 'drop-media', true)
on conflict (id) do nothing;

drop policy if exists "drop-media public read" on storage.objects;
create policy "drop-media public read"
  on storage.objects for select
  using (bucket_id = 'drop-media');

drop policy if exists "drop-media own insert" on storage.objects;
create policy "drop-media own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "drop-media own update" on storage.objects;
create policy "drop-media own update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "drop-media own delete" on storage.objects;
create policy "drop-media own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Done. Next: set the site URL + redirect URLs in Supabase Auth settings,
-- then deploy the frontend with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
-- ============================================================================
