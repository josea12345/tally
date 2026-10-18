-- 0002: rename verdict values HIT/MISS -> W/L.
-- Production has no verdicts yet, but migrate any existing rows anyway.
alter table public.verdicts drop constraint if exists verdicts_verdict_check;

update public.verdicts set verdict = 'W' where verdict = 'HIT';
update public.verdicts set verdict = 'L' where verdict = 'MISS';

alter table public.verdicts
  add constraint verdicts_verdict_check check (verdict in ('W', 'L'));
