import { supabase } from './supabase'

export interface MusicTrack {
  id: string
  name: string
  artists: string
  album: string
  /** Largest album-art URL (Deezer CDN). */
  image: string | null
  /** Popularity 0–100 (Deezer rank normalized). */
  popularity: number
  /** Canonical deezer.com track link. */
  url: string
}

/**
 * Search tracks through the music-search edge function (Deezer-backed,
 * login required). Throws on network/auth errors; returns [] when the
 * function isn't reachable so manual entry keeps working.
 */
export async function searchMusic(q: string): Promise<MusicTrack[]> {
  const query = q.trim()
  if (!query) return []
  const { data, error } = await supabase.functions.invoke('music-search', {
    body: { q: query },
  })
  if (error) throw error
  return ((data as { tracks?: MusicTrack[] })?.tracks ?? []) as MusicTrack[]
}
