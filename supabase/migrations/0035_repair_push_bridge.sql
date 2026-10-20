-- ============================================================================
-- 0035 — Repair the push bridge on notifications.
-- The Oct-19 push hookup left a trigger on public.notifications that calls
-- extensions.http_post(...), a function that does not exist in this
-- database (42883). It has aborted EVERY notification insert since —
-- silently, because both the old client writer and the 0033 triggers
-- swallow insert failures. Drop every legacy trigger on the table and
-- rebuild the bridge against pg_net's real schema (looked up live),
-- authenticating to the edge gateway with the public anon key.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select tgname from pg_trigger
    where tgrelid = 'public.notifications'::regclass and not tgisinternal
  loop
    execute format('drop trigger %I on public.notifications', r.tgname);
  end loop;
end $$;

do $$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'http_post'
   limit 1;
  if v_schema is null then
    raise notice 'pg_net http_post not found — push bridge not rebuilt';
    return;
  end if;
  execute format($f$
    create or replace function public.notify_push()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      begin
        perform %I.http_post(
          url := 'https://jbeljczivhiwkuylfvdf.supabase.co/functions/v1/push-on-notify',
          body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'notifications',
            'record', to_jsonb(NEW)
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'sb_publishable_ganApCvjxKxdzQ3rbli1hA_v79Bub-N',
            'Authorization', 'Bearer sb_publishable_ganApCvjxKxdzQ3rbli1hA_v79Bub-N'
          ),
          timeout_milliseconds := 5000
        );
      exception when others then
        null;
      end;
      return NEW;
    end;
    $body$;
  $f$, v_schema);
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notify_push();
