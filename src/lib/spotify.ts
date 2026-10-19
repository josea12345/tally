import { supabase } from './supabase'

export interface SpotifyTrack {
  id: string
  name: string
  artists: string
  album: string
  /** Largest album-art URL (Spotify CDN). */
  image: string | null
  /** Spotify popularity, 0–100. */
  popularity: number
  /** Canonical open.spotify.com track link. */
  url: string
}

/**
 * Search Spotify tracks through the spotify-search edge function (which
 * holds the Client Secret — it never ships to the app). Requires login.
 * Throws on network/auth errors; returns [] when the function isn't
 * configured yet so manual entry keeps working.
 */
export async function searchSpotify(q: string): Promise<SpotifyTrack[]> {
  const query = q.trim()
  if (!query) return []
  const { data, error } = await supabase.functions.invoke('spotify-search', {
    body: { q: query },
  })
  if (error) throw error
  return ((data as { tracks?: SpotifyTrack[] })?.tracks ?? []) as SpotifyTrack[]
}
