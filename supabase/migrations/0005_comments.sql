-- 0005: comments on drops.
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

-- public read (comments are part of the open conversation)
drop policy if exists "comments public read" on public.comments;
create policy "comments public read"
  on public.comments for select using (true);

-- anyone signed in can comment
drop policy if exists "comments authed insert" on public.comments;
create policy "comments authed insert"
  on public.comments for insert
  with check (auth.uid() = user_id);

-- authors can edit / delete their own
drop policy if exists "comments own update" on public.comments;
create policy "comments own update"
  on public.comments for update using (auth.uid() = user_id);

drop policy if exists "comments own delete" on public.comments;
create policy "comments own delete"
  on public.comments for delete using (auth.uid() = user_id);
