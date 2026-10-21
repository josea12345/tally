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
// POST { q: string, type?: 'track' | 'album' | 'artist' }
//   -> { tracks: [{ id, kind, name, artists, album, image, popularity, url }] }
// popularity = Deezer rank normalized to 0–100 (tracks only; rank tops out
// near 1,000,000 — album/artist search results carry no rank, so null).

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
  let type: 'track' | 'album' | 'artist' = 'track'
  try {
    const body = await req.json()
    q = body.q?.trim() ?? ''
    if (body.type === 'album' || body.type === 'artist') type = body.type
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!q || q.length > 120) return json({ error: 'bad_request' }, 400)

  try {
    const path = type === 'track' ? 'search' : `search/${type}`
    const res = await fetch(
      `https://api.deezer.com/${path}?q=${encodeURIComponent(q)}&limit=12`,
    )
    if (!res.ok) return json({ error: `deezer_search_failed:${res.status}` }, 502)
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (data.data ?? []) as any[]
    const tracks = items.map((t) => {
      if (type === 'album') {
        return {
          id: String(t.id),
          kind: 'album',
          name: t.title,
          artists: t.artist?.name ?? '',
          album: `${t.nb_tracks ?? 0} tracks`,
          image: t.cover_xl ?? t.cover_big ?? t.cover_medium ?? null,
          popularity: null,
          url: t.link,
        }
      }
      if (type === 'artist') {
        return {
          id: String(t.id),
          kind: 'artist',
          name: t.name,
          artists: 'Artist',
          album: `${t.nb_album ?? 0} albums`,
          image: t.picture_xl ?? t.picture_big ?? t.picture_medium ?? null,
          popularity: null,
          url: t.link,
        }
      }
      return {
        id: String(t.id),
        kind: 'track',
        name: t.title,
        artists: t.artist?.name ?? '',
        album: t.album?.title ?? '',
        image: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
        popularity: Math.min(100, Math.round((t.rank ?? 0) / 10000)),
        url: t.link,
        preview: t.preview ?? null,
      }
    })
    return json({ tracks })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 502)
  }
})
