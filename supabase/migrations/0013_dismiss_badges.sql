-- 0013 — Dismissible badges: per-user list of badge ids hidden from the profile.

alter table public.profiles
  add column if not exists dismissed_badges text[] not null default '{}';
