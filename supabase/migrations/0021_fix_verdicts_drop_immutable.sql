-- PROPOSED — NEEDS JOSE'S APPROVAL. Do not run without approval.
-- 0020 — verdicts: make drop_id immutable on UPDATE.
-- Finding S2: "verdicts own update" constrains user_id but not drop_id, so via
-- direct API calls a user could move their verdict row from drop A to drop B,
-- silently shifting W/L tallies and both authors' Taste Scores. The vote /
-- retract flows (feedVotes.ts, VerdictBox.tsx) only ever change verdict/tried,
-- so pinning drop_id breaks nothing in the app.
create or replace function public.verdicts_pin_drop()
returns trigger language plpgsql as $$
begin
  if new.drop_id is distinct from old.drop_id then
    raise exception 'verdicts: drop_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists verdicts_pin_drop on public.verdicts;
create trigger verdicts_pin_drop
  before update on public.verdicts
  for each row execute function public.verdicts_pin_drop();
