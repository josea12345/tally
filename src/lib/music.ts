import { supabase } from './supabase'

export type MusicKind = 'track' | 'album' | 'artist'

export interface MusicTrack {
  id: string
  kind: MusicKind
  name: string
  artists: string
  album: string
  /** Largest art URL (Deezer CDN): album cover or artist picture. */
  image: string | null
  /** Popularity 0–100 (Deezer rank normalized). Tracks only; null otherwise. */
  popularity: number | null
  /** Canonical deezer.com link for the track, album or artist. */
  url: string
  /** 30-second MP3 preview (tracks only; null otherwise). */
  preview: string | null
}

/**
 * Search music through the music-search edge function (Deezer-backed,
 * login required). `kind` selects songs, albums or artists. Throws on
 * network/auth errors; returns [] when nothing matches.
 */
export async function searchMusic(q: string, kind: MusicKind = 'track'): Promise<MusicTrack[]> {
  const query = q.trim()
  if (!query) return []
  const { data, error } = await supabase.functions.invoke('music-search', {
    body: { q: query, type: kind },
  })
  if (error) throw error
  return ((data as { tracks?: MusicTrack[] })?.tracks ?? []) as MusicTrack[]
}
