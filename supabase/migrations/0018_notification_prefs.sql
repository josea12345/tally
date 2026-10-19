alter table public.profiles
  add column if not exists notify_wl boolean not null default true;

alter table public.profiles
  add column if not exists notify_follows boolean not null default true;

alter table public.profiles
  add column if not exists notify_comments boolean not null default true;
