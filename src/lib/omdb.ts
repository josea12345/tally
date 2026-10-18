/**
 * OMDb — the only free source for real IMDb ratings (1,000 lookups/day free).
 * Used at post time: TMDB gives the exact imdb_id, OMDb gives the number.
 * Needs VITE_OMDB_API_KEY; without it the rating is simply skipped.
 */
const KEY = import.meta.env.VITE_OMDB_API_KEY as string | undefined

export const omdbEnabled = !!KEY

export async function fetchOmdbRating(imdbId: string): Promise<number | null> {
  if (!KEY || !/^tt\d+$/.test(imdbId)) return null
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${KEY}`)
    if (!res.ok) return null
    const j = await res.json()
    const r = parseFloat(j.imdbRating)
    return Number.isFinite(r) ? Math.round(r * 10) / 10 : null
  } catch {
    return null
  }
}
