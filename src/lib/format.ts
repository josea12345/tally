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

export function isPlaceholderUsername(username: string): boolean {
  return /^user_[0-9a-f]{8}$/.test(username)
}
