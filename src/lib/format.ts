export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const s = Math.max(1, Math.floor((now - then) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(d / 365)}y`
}

export function formatCount(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
}

export function formatMiles(km: number | null | undefined): string | null {
  if (km == null || !isFinite(km)) return null
  const mi = km * 0.621371
  if (mi < 0.1) return `${Math.round(mi * 5280)} ft away`
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away`
}

/** Normalize a title+city pair for re-drop / chain matching. */
export function normKey(title: string, city: string | null | undefined): string {
  return `${title.trim().toLowerCase()}|${(city ?? '').trim().toLowerCase()}`
}

/** Categories whose topics are city-scoped (a place in Miami ≠ the same name in NYC). */
const LOCAL_CATEGORIES = new Set(['food_drink', 'shops', 'places'])

/**
 * A drop's shareable topic: the IMDb id for movies/TV when known (exact),
 * otherwise the normalized title (+ city for local categories).
 * Mirrored in SQL by migration 0029's backfill — keep the two in sync.
 */
export function topicKeyFor(d: {
  category: string
  title: string
  city?: string | null
  imdb_id?: string | null
  place_id?: string | null
}): string {
  if (d.imdb_id) return `imdb:${d.imdb_id}`
  if (d.place_id) return `place:${d.place_id}`
  const cityPart = LOCAL_CATEGORIES.has(d.category) ? d.city ?? '' : ''
  return `title:${normKey(d.title, cityPart)}`
}

export function isPlaceholderUsername(username: string): boolean {
  return /^user_[0-9a-f]{8}$/.test(username)
}
