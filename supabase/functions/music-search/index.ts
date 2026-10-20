// Supabase Edge Function: music-search
//
// Proxies Deezer track search for the composer's music picker. Deezer's
// public API needs no key, so there are no secrets to hold — the function
// exists to require a logged-in TALLY user (prevents open-proxy abuse)
// and to normalize results into the app's track shape.
//
// (This replaced spotify-search: Spotify has new developer app creation
// on hold platform-wide, so no Client ID/Secret can be obtained.)
//
// POST { q: string } -> { tracks: [{ id, name, artists, album, image, popularity, url }] }
// popularity = Deezer rank normalized to 0–100 (rank tops out near 1,000,000).

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

interface DeezerTrack {
  id: number
  title: string
  link: string
  rank?: number
  artist?: { name: string }
  album?: {
    title: string
    cover_xl?: string
    cover_big?: string
    cover_medium?: string
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Must be a logged-in TALLY user. NOTE: getUser() with no argument
  // throws AuthSessionMissingError in the edge runtime even when the
  // Authorization header is set globally — pass the caller's token
  // explicitly (verified live 2026-10-20).
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const {
    data: { user },
  } = await supabase.auth.getUser(token)
  if (!user) return json({ error: 'unauthorized' }, 401)

  let q = ''
  try {
    q = (await req.json()).q?.trim() ?? ''
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!q || q.length > 120) return json({ error: 'bad_request' }, 400)

  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=12`,
    )
    if (!res.ok) return json({ error: `deezer_search_failed:${res.status}` }, 502)
    const data = await res.json()
    const tracks = ((data.data ?? []) as DeezerTrack[]).map((t) => ({
      id: String(t.id),
      name: t.title,
      artists: t.artist?.name ?? '',
      album: t.album?.title ?? '',
      image: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
      popularity: Math.min(100, Math.round((t.rank ?? 0) / 10000)),
      url: t.link,
    }))
    return json({ tracks })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 502)
  }
})
