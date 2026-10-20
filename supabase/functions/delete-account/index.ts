// delete-account — permanently deletes the CALLER's account.
// Auth: verify_jwt is on, and the caller is resolved from the explicit
// Bearer token (auth.getUser(token) — the no-arg session form throws in
// this runtime). Deleting the auth user cascades every public row
// (profiles → drops/verdicts/comments/saves/follows/reports…), so the
// only manual cleanup is the caller's storage files, best-effort first.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Sign in required' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const asUser = createClient(url, anon)
    const { data: userData, error: userErr } = await asUser.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Sign in required' }, 401)
    const uid = userData.user.id

    const admin = createClient(url, service)

    // Best-effort storage cleanup (own folders in both buckets).
    for (const bucket of ['drop-media', 'avatars']) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 })
        const paths = (files ?? [])
          .filter((f) => f.name && !f.name.startsWith('.'))
          .map((f) => `${uid}/${f.name}`)
        if (paths.length > 0) await admin.storage.from(bucket).remove(paths)
      } catch {
        // Orphaned files are a storage cost, not a blocker — proceed.
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) return json({ error: delErr.message }, 500)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Delete failed' }, 500)
  }
})
