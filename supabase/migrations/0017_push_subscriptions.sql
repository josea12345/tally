-- 0017 — Web Push subscriptions (one row per browser/device).

create table if not exists public.push_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subs own all" on public.push_subscriptions;
create policy "push_subs own all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
