-- 0047: per-item media edits (trim/speed/filter/text) rendered live by the players.
alter table public.drops add column if not exists media_edits jsonb;