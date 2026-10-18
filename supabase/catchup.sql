-- TALLY catch-up: everything not yet applied, in order. Safe to run twice.
-- Paste the whole thing into the Supabase SQL Editor and hit Run.

-- 1) photo/video bucket (uploads fail without this)
insert into storage.buckets (id, name, public)
values ('drop-media', 'drop-media', true)
on conflict (id) do nothing;

-- 2) verdicts HIT/MISS -> W/L
alter table public.verdicts drop constraint if exists verdicts_verdict_check;
update public.verdicts set verdict = 'W' where verdict = 'HIT';
update public.verdicts set verdict = 'L' where verdict = 'MISS';
alter table public.verdicts
  add constraint verdicts_verdict_check check (verdict in ('W', 'L'));

-- 3) categories restaurants/cafes/bars -> food_drink
alter table public.drops drop constraint if exists drops_category_check;
update public.drops
  set category = 'food_drink'
  where category in ('restaurants', 'cafes', 'bars');
alter table public.drops
  add constraint drops_category_check
  check (category in ('food_drink', 'shops', 'places', 'movies', 'tv', 'music'));

-- 4) categories movies/tv -> movies_tv
alter table public.drops drop constraint if exists drops_category_check;
update public.drops
  set category = 'movies_tv'
  where category in ('movies', 'tv');
alter table public.drops
  add constraint drops_category_check
  check (category in ('food_drink', 'shops', 'places', 'movies_tv', 'music'));

-- 5) comments table + RLS
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null constraint comments_body_check check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_drop_idx on public.comments (drop_id, created_at);
create index if not exists comments_user_idx on public.comments (user_id);

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch
  before update on public.comments
  for each row execute function public.touch_updated_at();

alter table public.comments enable row level security;

drop policy if exists "comments public read" on public.comments;
create policy "comments public read"
  on public.comments for select using (true);

drop policy if exists "comments authed insert" on public.comments;
create policy "comments authed insert"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "comments own update" on public.comments;
create policy "comments own update"
  on public.comments for update using (auth.uid() = user_id);

drop policy if exists "comments own delete" on public.comments;
create policy "comments own delete"
  on public.comments for delete using (auth.uid() = user_id);

-- 6) optional 1-10 author's-call score on drops
alter table public.drops
  add column if not exists score smallint
  constraint drops_score_check check (score is null or (score >= 1 and score <= 10));
