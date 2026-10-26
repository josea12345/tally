-- 0057: Put-me-on requests — the demand side of the put-on.
-- Someone asks ("put me on: best late-night tacos near Brickell"),
-- anyone answers by pointing at a real drop. Answering notifies the
-- asker through the standard emit_notification path (kind 'answer'),
-- so push delivery comes free.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('W','L','follow','comment','approved','requested','mention',
                  'like','reminder','recap','streak','peak','answer'));

create table if not exists public.put_on_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 140),
  category text,
  neighborhood text,
  created_at timestamptz not null default now()
);
create index if not exists put_on_requests_created_idx
  on public.put_on_requests (created_at desc);

create table if not exists public.request_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.put_on_requests(id) on delete cascade,
  drop_id uuid not null references public.drops(id) on delete cascade,
  answered_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, drop_id)
);
create index if not exists request_answers_request_idx
  on public.request_answers (request_id, created_at);

alter table public.put_on_requests enable row level security;
alter table public.request_answers enable row level security;

drop policy if exists requests_read on public.put_on_requests;
create policy requests_read on public.put_on_requests
  for select using (true);
drop policy if exists requests_insert on public.put_on_requests;
create policy requests_insert on public.put_on_requests
  for insert with check (author_id = auth.uid());
drop policy if exists requests_delete on public.put_on_requests;
create policy requests_delete on public.put_on_requests
  for delete using (author_id = auth.uid());

drop policy if exists answers_read on public.request_answers;
create policy answers_read on public.request_answers
  for select using (true);
drop policy if exists answers_insert on public.request_answers;
create policy answers_insert on public.request_answers
  for insert with check (
    answered_by = auth.uid()
    and exists (select 1 from public.drops d where d.id = drop_id)
  );
drop policy if exists answers_delete on public.request_answers;
create policy answers_delete on public.request_answers
  for delete using (answered_by = auth.uid());

grant select on public.put_on_requests to anon, authenticated;
grant insert, delete on public.put_on_requests to authenticated;
grant select on public.request_answers to anon, authenticated;
grant insert, delete on public.request_answers to authenticated;

create or replace function public.trg_request_answer_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asker uuid;
begin
  begin
    select author_id into v_asker from public.put_on_requests where id = new.request_id;
    if v_asker is not null then
      perform public.emit_notification(v_asker, new.answered_by, 'answer', new.drop_id);
    end if;
  exception when others then
    null; -- a notification failure never breaks the answer
  end;
  return new;
end;
$$;

drop trigger if exists request_answers_notify on public.request_answers;
create trigger request_answers_notify
  after insert on public.request_answers
  for each row execute function public.trg_request_answer_notify();
