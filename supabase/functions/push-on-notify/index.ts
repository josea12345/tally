// Supabase Edge Function: push-on-notify
//
// Sends a Web Push message for every new row in public.notifications.
// Trigger: Database webhook on notifications INSERT -> POST to this function.
// Secrets (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import webpush from 'npm:web-push@3.6.7'

webpush.setVapidDetails(
  'mailto:tally-notifications@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

function missingEnv(): string[] {
  return [
    !Deno.env.get('VAPID_PUBLIC_KEY') && 'VAPID_PUBLIC_KEY',
    !Deno.env.get('VAPID_PRIVATE_KEY') && 'VAPID_PRIVATE_KEY',
    !Deno.env.get('SUPABASE_URL') && 'SUPABASE_URL',
    !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean) as string[]
}

serve(async (req) => {
  const missing = missingEnv()
  if (missing.length > 0) {
    return new Response(JSON.stringify({ error: 'missing secrets', missing }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('bad payload', { status: 400 })
  }
  const record = payload?.record
  if (!record?.user_id || !record?.actor_id) {
    return new Response('not a notification insert', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const [{ data: actor }, { data: drop }] = await Promise.all([
    supabase
      .from('profiles')
      .select('username,display_name')
      .eq('id', record.actor_id)
      .maybeSingle(),
    record.drop_id
      ? supabase.from('drops').select('title').eq('id', record.drop_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const name = actor?.display_name || (actor ? `@${actor.username}` : 'Someone')
  const title = drop ? `\u201c${drop.title}\u201d` : 'your drop'
  const bodies: Record<string, string> = {
    W: `${name} called W on ${title}`,
    L: `${name} called L on ${title}`,
    follow: `${name} followed you`,
    comment: `${name} commented on ${title}`,
    mention: `${name} mentioned you on ${title}`,
    approved: `${name} approved your follow request`,
    requested: `${name} requested to follow you`,
  }
  const body = bodies[record.kind] ?? 'Something happened on TALLY.'
  const url = record.drop_id ? `/#/drop/${record.drop_id}` : '/#/notifications'

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('user_id', record.user_id)

  await Promise.allSettled(
    (subs ?? []).map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: 'TALLY', body, url, tag: record.id }),
        )
        .catch(async (err: any) => {
          // Prune dead subscriptions so we don't keep pushing to ghosts.
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          } else {
            console.error('push send failed', err?.statusCode, err?.message)
          }
        }),
    ),
  )

  return new Response('ok')
})
