-- ============================================================================
-- 0034 — Fix 0033's silent notification failure.
-- emit_notification() pins search_path = public, but inserting a
-- notification fires the 0017 push trigger, which calls
-- extensions.http_post — unresolvable under a public-only path (42883),
-- and the trigger wrappers swallowed it: actions succeeded, no alerts.
-- Widen the path on the 0033 functions to public + extensions.
-- ============================================================================

alter function public.emit_notification(uuid, uuid, text, uuid)
  set search_path = public, extensions;

alter function public.trg_verdict_notify()
  set search_path = public, extensions;

alter function public.trg_comment_notify()
  set search_path = public, extensions;

alter function public.trg_follow_notify()
  set search_path = public, extensions;

alter function public.trg_follow_request_notify()
  set search_path = public, extensions;
