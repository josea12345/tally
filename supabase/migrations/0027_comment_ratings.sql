-- 0027: optional 1–10 rating on comments (one per user per drop).
--
-- Lets commenters attach a rating to their comment via the composer picker.
-- "One per user per post" is enforced by the partial unique index below;
-- the client upserts (clears the user's old rated comment, then inserts).
-- RLS: existing comments policies don't restrict columns, so `rating`
-- flows through the author's own insert/update. The 0020 trigger only pins
-- user_id/drop_id, so rating edits are unaffected.
-- The drop author's own comment ratings are excluded from community
-- aggregates client-side (their take is the drop's author score).

alter table public.comments
  add column rating smallint null
  constraint comments_rating_check check (rating between 1 and 10);

create unique index if not exists comments_one_rating_per_user
  on public.comments (drop_id, user_id)
  where rating is not null;
