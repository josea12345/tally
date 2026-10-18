/**
 * Place autocomplete: Photon (OSM) + ArcGIS World Geocoding suggest, merged.
 * Free and keyless. Category-filtered, GPS-biased, local-first.
 */
import type { Category, PlaceSuggestion } from './types'
import { bboxAround, haversineKm, mapsUrlFor, type LatLon } from './geo'

/** OSM key:value tags that define each place category. Bakery counts as café. */
const CATEGORY_TAGS: Record<string, string[]> = {
  restaurants: ['amenity:restaurant', 'amenity:fast_food'],
  cafes: ['amenity:cafe', 'shop:coffee', 'shop:tea', 'shop:bakery'],
  bars: ['amenity:bar', 'amenity:pub', 'amenity:nightclub', 'amenity:biergarten'],
  shops: ['shop'],
  places: [],
}

const TAG_LABELS: Record<string, string> = {
  'amenity:restaurant': 'Restaurant',
  'amenity:fast_food': 'Fast food',
  'amenity:cafe': 'Café',
  'shop:coffee': 'Coffee shop',
  'shop:tea': 'Tea shop',
  'shop:bakery': 'Bakery',
  'amenity:bar': 'Bar',
  'amenity:pub': 'Pub',
  'amenity:nightclub': 'Nightclub',
  'amenity:biergarten': 'Beer garden',
  shop: 'Shop',
}

const ARCGIS_KEYWORDS: Record<string, string[]> = {
  restaurants: ['restaurant', 'grill', 'pizzeria', 'sushi', 'taqueria', 'diner', 'eatery', 'bistro', 'cafe'],
  cafes: ['coffee', 'café', 'cafe', 'bakery', 'tea', 'espresso'],
  bars: ['bar', 'pub', 'nightclub', 'lounge', 'brewery', 'tavern'],
  shops: ['store', 'shop', 'market', 'boutique', 'mall'],
  places: [],
}

function friendlyType(osmKey: string | undefined, osmValue: string | undefined): string {
  if (osmKey && osmValue) {
    const hit = TAG_LABELS[`${osmKey}:${osmValue}`]
    if (hit) return hit
  }
  if (osmKey === 'shop') return 'Shop'
  if (osmValue) return osmValue.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return 'Place'
}

function tagFitsCategory(osmKey: string | undefined, osmValue: string | undefined, category: Category): boolean {
  const tags = CATEGORY_TAGS[category] ?? []
  if (tags.length === 0) return true
  if (!osmKey) return false
  if (tags.includes(osmKey)) return true // key-only tag like "shop"
  if (osmValue && tags.includes(`${osmKey}:${osmValue}`)) return true
  return false
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    name?: string
    street?: string
    housenumber?: string
    district?: string
    city?: string
    state?: string
    country?: string
    osm_key?: string
    osm_value?: string
  }
}

function photonToSuggestion(f: PhotonFeature, origin: LatLon): PlaceSuggestion | null {
  const p = f.properties ?? {}
  const coords = f.geometry?.coordinates
  if (!p.name || !coords) return null
  const lat = coords[1]
  const lon = coords[0]
  const street = [p.housenumber, p.street].filter(Boolean).join(' ') || null
  return {
    id: `photon-${p.name}-${lat.toFixed(5)}-${lon.toFixed(5)}`,
    name: p.name,
    type: friendlyType(p.osm_key, p.osm_value),
    streetAddress: street,
    neighborhood: p.district ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    latitude: lat,
    longitude: lon,
    distanceKm: haversineKm(origin, { lat, lon }),
    mapsUrl: mapsUrlFor(lat, lon),
    source: 'photon',
  }
}

async function photonSearch(
  query: string,
  origin: LatLon,
  opts: { bbox?: string; tags?: string[]; limit?: number }
): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({
    q: query,
    lat: String(origin.lat),
    lon: String(origin.lon),
    limit: String(opts.limit ?? 20),
    lang: 'en',
  })
  if (opts.bbox) params.set('bbox', opts.bbox)
  const tagQS = (opts.tags ?? []).map((t) => `osm_tag=${encodeURIComponent(t)}`).join('&')
  const url = `https://photon.komoot.io/api/?${params.toString()}${tagQS ? `&${tagQS}` : ''}`
  const r = await fetch(url)
  if (!r.ok) return []
  const j = (await r.json()) as { features?: PhotonFeature[] }
  return j.features ?? []
}

interface ArcGISSuggestion {
  text: string
  magicKey: string
}

async function arcgisSuggest(query: string, origin: LatLon): Promise<ArcGISSuggestion[]> {
  const params = new URLSearchParams({
    text: query,
    location: `${origin.lon},${origin.lat}`,
    distance: '80000',
    f: 'json',
  })
  const r = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?${params}`)
  if (!r.ok) return []
  const j = (await r.json()) as { suggestions?: ArcGISSuggestion[] }
  return (j.suggestions ?? []).slice(0, 6)
}

interface ArcGISPOI {
  address: string
  location: { x: number; y: number }
  attributes?: { PlaceName?: string; Place_addr?: string; Type?: string; City?: string; Region?: string }
}

async function arcgisDetails(s: ArcGISSuggestion): Promise<PlaceSuggestion | null> {
  try {
    const params = new URLSearchParams({
      SingleLine: s.text,
      magicKey: s.magicKey,
      outFields: '*',
      f: 'json',
    })
    const r = await fetch(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`
    )
    if (!r.ok) return null
    const j = (await r.json()) as { candidates?: ArcGISPOI[] }
    const c = j.candidates?.[0]
    if (!c) return null
    const lat = c.location.y
    const lon = c.location.x
    const name = c.attributes?.PlaceName || s.text.split(',')[0]!.trim()
    return {
      id: `arcgis-${s.magicKey}`,
      name,
      type: c.attributes?.Type ?? 'Place',
      streetAddress: c.attributes?.Place_addr || c.address?.split(',')[0]?.trim() || null,
      neighborhood: null,
      city: c.attributes?.City ?? null,
      state: c.attributes?.Region ?? null,
      latitude: lat,
      longitude: lon,
      distanceKm: null, // filled by caller
      mapsUrl: mapsUrlFor(lat, lon),
      source: 'arcgis',
    }
  } catch {
    return null
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Place-type hints that are never a food/drink/retail outing, whatever the name. */
const NON_VENUE_TYPE_HINTS = [
  'doctor', 'dentist', 'physician', 'surgeon', 'clinic', 'hospital', 'pharmacy',
  'lawyer', 'attorney', 'law firm', 'accountant', 'insurance', 'realtor',
]

function arcgisFitsCategory(s: PlaceSuggestion, query: string, category: Category): boolean {
  const kws = ARCGIS_KEYWORDS[category] ?? []
  if (kws.length === 0) return true
  const name = s.name.toLowerCase()
  const q = query.trim().toLowerCase()
  // Direct name hit: the query matches a whole word in the place name.
  // Trust the geocoder's own ranking over our type keywords here — e.g.
  // "Kush Brickell" is typed as Restaurant by ArcGIS, but when the user
  // typed "kush" looking for the bar, the name match is what matters.
  // (Word-boundary match, and the type must not be a clear non-venue like
  // Doctor — so "Kushner David S MD" still fails "kushner".)
  if (q && new RegExp(`\\b${escapeRegExp(q)}\\b`).test(name)) {
    const t = (s.type ?? '').toLowerCase()
    if (!NON_VENUE_TYPE_HINTS.some((h) => t.includes(h))) return true
  }
  const hay = `${s.name} ${s.type}`.toLowerCase()
  return kws.some((k) => hay.includes(k))
}

function dedupe(sugs: PlaceSuggestion[]): PlaceSuggestion[] {
  const out: PlaceSuggestion[] = []
  for (const s of sugs) {
    const dup = out.some(
      (o) =>
        o.name.trim().toLowerCase() === s.name.trim().toLowerCase() &&
        haversineKm({ lat: o.latitude, lon: o.longitude }, { lat: s.latitude, lon: s.longitude }) < 0.15
    )
    if (!dup) out.push(s)
  }
  return out
}

/**
 * Search places near `origin`.
 * Ladder: (1) strict category search in local bbox → (2) broad local search with
 * name-match requirement → (3) worldwide category search, distance-ranked.
 * ArcGIS suggestions are merged into the local rungs.
 */
export async function searchPlaces(
  query: string,
  category: Category,
  origin: LatLon
): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const tags = CATEGORY_TAGS[category] ?? []
  const box = bboxAround(origin)
  const lowered = q.toLowerCase()

  // Rung 1: strict category search inside the local box.
  let features = await photonSearch(q, origin, { bbox: box, tags, limit: 20 })
  let sugs: PlaceSuggestion[] = []
  for (const f of features) {
    const s = photonToSuggestion(f, origin)
    if (s && tagFitsCategory(f.properties?.osm_key, f.properties?.osm_value, category)) sugs.push(s)
  }

  // Merge ArcGIS local suggestions (category keyword fit).
  try {
    const ag = await arcgisSuggest(q, origin)
    const details = await Promise.all(ag.map(arcgisDetails))
    for (const d of details) {
      if (d && arcgisFitsCategory(d, q, category)) {
        d.distanceKm = haversineKm(origin, { lat: d.latitude, lon: d.longitude })
        // keep only genuinely local ArcGIS hits (inside ~120km)
        if ((d.distanceKm ?? 9999) < 120) sugs.push(d)
      }
    }
  } catch {
    /* ArcGIS is a best-effort secondary source */
  }

  if (sugs.length > 0) {
    return finish(sugs, origin)
  }

  // Rung 2: broad local search — same box, no tag filter, name must contain the query.
  features = await photonSearch(q, origin, { bbox: box, limit: 20 })
  for (const f of features) {
    const s = photonToSuggestion(f, origin)
    if (s && s.name.toLowerCase().includes(lowered)) sugs.push(s)
  }
  if (sugs.length > 0) {
    return finish(sugs, origin)
  }

  // Rung 3: worldwide category search, distance-ranked.
  features = await photonSearch(q, origin, { tags, limit: 20 })
  for (const f of features) {
    const s = photonToSuggestion(f, origin)
    if (s && tagFitsCategory(f.properties?.osm_key, f.properties?.osm_value, category)) sugs.push(s)
  }
  return finish(sugs, origin)
}

function finish(sugs: PlaceSuggestion[], origin: LatLon): PlaceSuggestion[] {
  for (const s of sugs) {
    if (s.distanceKm == null) s.distanceKm = haversineKm(origin, { lat: s.latitude, lon: s.longitude })
  }
  const deduped = dedupe(sugs)
  deduped.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
  return deduped.slice(0, 8)
}
