-- 0006: optional 1-10 author's-call score on drops.
alter table public.drops
  add column if not exists score smallint
  constraint drops_score_check check (score is null or (score >= 1 and score <= 10));
