-- ============================================================================
-- 0050 — Soundtrack trimming: which part of the 30s preview plays over
-- the video. start defaults 0; end null = play to the preview's end.
-- ============================================================================

alter table public.drops
  add column if not exists sound_start_sec numeric not null default 0,
  add column if not exists sound_end_sec numeric;
