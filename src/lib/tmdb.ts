/**
 * TMDB (The Movie Database) title search — the IMDb-equivalent catalog for
 * movies and TV shows. Free API key, client-side safe.
 * Needs VITE_TMDB_API_KEY; everything degrades to manual entry without it.
 */
const KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined

export const tmdbEnabled = !!KEY

export interface TmdbTitle {
  id: number
  title: string
  year: string
  overview: string
  posterUrl: string | null
  tmdbUrl: string
}

export async function searchTmdb(query: string, kind: 'movie' | 'tv'): Promise<TmdbTitle[]> {
  const q = query.trim()
  if (!KEY || !q) return []
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${kind}?api_key=${KEY}&query=${encodeURIComponent(q)}&include_adult=false`
    )
    if (!res.ok) return []
    const json = await res.json()
    return ((json.results ?? []) as any[]).slice(0, 8).map((r) => ({
      id: r.id,
      title: kind === 'movie' ? r.title : r.name,
      year: String(kind === 'movie' ? r.release_date : r.first_air_date ?? '').slice(0, 4),
      overview: r.overview ?? '',
      posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
      tmdbUrl: `https://www.themoviedb.org/${kind}/${r.id}`,
    }))
  } catch {
    return []
  }
}
