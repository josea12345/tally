/** Geolocation + reverse-geocoding helpers. Free, keyless services only. */

export interface LatLon {
  lat: number
  lon: number
}

const LOC_KEY = 'tally_location_v1'

/** A small table of well-known cities so the profile-city fallback has coordinates. */
const CITY_COORDS: Record<string, LatLon> = {
  miami: { lat: 25.7617, lon: -80.1918 },
  'new york': { lat: 40.7128, lon: -74.006 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  chicago: { lat: 41.8781, lon: -87.6298 },
  houston: { lat: 29.7604, lon: -95.3698 },
  atlanta: { lat: 33.749, lon: -84.388 },
  austin: { lat: 30.2672, lon: -97.7431 },
  seattle: { lat: 47.6062, lon: -122.3321 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  boston: { lat: 42.3601, lon: -71.0589 },
  denver: { lat: 39.7392, lon: -104.9903 },
  nashville: { lat: 36.1627, lon: -86.7816 },
  orlando: { lat: 28.5383, lon: -81.3792 },
  tampa: { lat: 27.9506, lon: -82.4572 },
  dallas: { lat: 32.7767, lon: -96.797 },
  philadelphia: { lat: 39.9526, lon: -75.1652 },
  'washington': { lat: 38.9072, lon: -77.0369 },
  managua: { lat: 12.1364, lon: -86.2514 },
}

export function cityCoords(city: string | null | undefined): LatLon {
  const key = (city ?? 'miami').trim().toLowerCase()
  return CITY_COORDS[key] ?? CITY_COORDS['miami']!
}

/** Bounding box (~±0.55° lat, ±0.65° lon ≈ 120×135 km) around a point, for local-first search. */
export function bboxAround(p: LatLon, latPad = 0.55, lonPad = 0.65): string {
  const minLat = p.lat - latPad
  const maxLat = p.lat + latPad
  const minLon = p.lon - lonPad
  const maxLon = p.lon + lonPad
  return `${minLon},${minLat},${maxLon},${maxLat}`
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const s1 = Math.sin(dLat / 2)
  const s2 = Math.sin(dLon / 2)
  const aa = s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2
  return 2 * R * Math.asin(Math.sqrt(aa))
}

export function mapsUrlFor(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

export function mapsUrlForQuery(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

interface CachedLoc extends LatLon {
  label: string
  ts: number
}

export function getCachedLocation(): (LatLon & { label: string }) | null {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as CachedLoc
    if (!isFinite(c.lat) || !isFinite(c.lon)) return null
    return { lat: c.lat, lon: c.lon, label: c.label }
  } catch {
    return null
  }
}

export function cacheLocation(lat: number, lon: number, label: string): void {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify({ lat, lon, label, ts: Date.now() } satisfies CachedLoc))
  } catch {
    /* ignore */
  }
}

export function clearCachedLocation(): void {
  try {
    localStorage.removeItem(LOC_KEY)
  } catch {
    /* ignore */
  }
}

/** Reverse-geocode coordinates to a "City, State" label via Photon (free, keyless). */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`)
    if (!r.ok) throw new Error('reverse failed')
    const j = (await r.json()) as {
      features?: Array<{ properties?: { name?: string; city?: string; state?: string; country?: string } }>
    }
    const p = j.features?.[0]?.properties
    if (!p) throw new Error('no feature')
    const city = p.city ?? p.name ?? ''
    const state = p.state ?? ''
    const label = [city, state].filter(Boolean).join(', ')
    return label || 'your area'
  } catch {
    return 'your area'
  }
}

export interface LocateResult {
  ok: boolean
  lat?: number
  lon?: number
  reason?: 'denied' | 'unavailable' | 'timeout'
}

/** One-shot device position. Resolves; never rejects. */
export function locateOnce(timeoutMs = 12000): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, reason: 'unavailable' })
      return
    }
    let done = false
    const finish = (r: LocateResult) => {
      if (!done) {
        done = true
        resolve(r)
      }
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ ok: true, lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) finish({ ok: false, reason: 'denied' })
          else if (err.code === err.TIMEOUT) finish({ ok: false, reason: 'timeout' })
          else finish({ ok: false, reason: 'unavailable' })
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 }
      )
    } catch {
      finish({ ok: false, reason: 'unavailable' })
    }
  })
}
