// Supabase Edge Function: spotify-search
//
// Proxies Spotify track search so the Client Secret never ships to the app.
// Requires a logged-in TALLY user (prevents open-proxy quota abuse).
//
// Secrets (Edge Functions -> Secrets): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
// (SUPABASE_URL + SUPABASE_ANON_KEY are provided automatically.)
//
// POST { q: string } -> { tracks: [{ id, name, artists, album, image, popularity, url }] }

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

// In-memory token cache (per isolate): Spotify tokens live 3600s.
let cached: { token: string; expiresAt: number } | null = null

async function spotifyToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token
  const id = Deno.env.get('SPOTIFY_CLIENT_ID')
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!id || !secret) throw new Error('missing_spotify_secrets')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${id}:${secret}`),
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`spotify_token_failed:${res.status}`)
  const data = await res.json()
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cached.token
}

interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  album: { name: string; images: { url: string; width: number }[] }
  popularity: number
  external_urls: { spotify: string }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Must be a logged-in TALLY user.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  let q = ''
  try {
    q = (await req.json()).q?.trim() ?? ''
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!q || q.length > 120) return json({ error: 'bad_request' }, 400)

  try {
    const token = await spotifyToken()
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10&market=US`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return json({ error: `spotify_search_failed:${res.status}` }, 502)
    const data = await res.json()
    const tracks = ((data.tracks?.items ?? []) as SpotifyTrack[]).map((t) => {
      const imgs = [...(t.album?.images ?? [])].sort((a, b) => b.width - a.width)
      return {
        id: t.id,
        name: t.name,
        artists: (t.artists ?? []).map((a) => a.name).join(', '),
        album: t.album?.name ?? '',
        image: imgs[0]?.url ?? null,
        popularity: t.popularity ?? 0,
        url: t.external_urls?.spotify ?? '',
      }
    })
    return json({ tracks })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    const status = msg === 'missing_spotify_secrets' ? 500 : 502
    return json({ error: msg }, status)
  }
})
