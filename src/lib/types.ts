export type Category =
  | 'food_drink'
  | 'shops'
  | 'places'
  | 'movies'
  | 'tv'
  | 'music'
  | 'recipes'

export const PLACE_CATEGORIES: Category[] = ['food_drink', 'shops', 'places']
export const MEDIA_CATEGORIES: Category[] = ['movies', 'tv', 'music']
export const ALL_CATEGORIES: Category[] = [...PLACE_CATEGORIES, ...MEDIA_CATEGORIES, 'recipes']

export const CATEGORY_LABELS: Record<Category, string> = {
  food_drink: 'Food & Drink',
  shops: 'Shops',
  places: 'Places',
  movies: 'Movies',
  tv: 'TV Shows',
  music: 'Music',
  recipes: 'Recipes',
}

export function isPlaceCategory(c: Category): boolean {
  return PLACE_CATEGORIES.includes(c)
}

export interface CategoryGroup {
  id: string
  label: string
  categories: Category[]
}

/**
 * Discover filter groups: display-only buckets over the flat leaf categories.
 * No data change — a drop keeps its leaf category; the group just ORs them.
 * Location rules stay per-leaf: recipes are global like music/movies, spots
 * narrow to near-you.
 */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  { id: 'food', label: 'Food & Drink', categories: ['food_drink', 'recipes'] },
  { id: 'places', label: 'Local', categories: ['places', 'shops'] },
  { id: 'entertainment', label: 'Play', categories: ['movies', 'tv', 'music'] },
]

export interface Profile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  city: string | null
  avatar_url: string | null
  is_private: boolean
  dismissed_badges: string[]
  notify_wl: boolean
  notify_follows: boolean
  notify_comments: boolean
  created_at: string
  updated_at: string
}

export interface Drop {
  id: string
  author_id: string
  category: Category
  title: string
  description: string
  city: string | null
  neighborhood: string | null
  street_address: string | null
  latitude: number | null
  longitude: number | null
  maps_url: string | null
  media_url: string | null // legacy single-media (pre-carousel); prefer dropMedia()
  media_type: 'photo' | 'video' | null // legacy; prefer dropMedia()
  media_poster_url: string | null // legacy; prefer dropMedia()
  /** Carousel: parallel arrays, position = order. Item 1 is the cover. */
  media_urls: string[]
  media_types: ('photo' | 'video')[]
  media_poster_urls: (string | null)[]
  /** Recipes: one ingredient per line, one step per line. */
  ingredients: string[]
  instructions: string[]
  external_url: string | null
  external_label: 'IMDb' | 'Rotten Tomatoes' | 'Spotify' | 'Official site' | 'TMDB' | null
  /** Exact IMDb id (tt…) + rating, resolved via TMDB → OMDb at post time. */
  imdb_id: string | null
  imdb_rating: number | null
  tip: string | null
  where_to: string | null
  score: number | null
  created_at: string
  updated_at: string
  // joined
  author?: Profile
}

export interface Save {
  id: string
  user_id: string
  drop_id: string
  created_at: string
}

export interface Verdict {
  id: string
  user_id: string
  drop_id: string
  tried: boolean
  verdict: 'W' | 'L' | null
  created_at: string
  updated_at: string
  user?: Profile
}

export interface Comment {
  id: string
  drop_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  user?: Profile
}

export interface Follow {
  id: string
  follower_id: string
  followee_id: string
  created_at: string
}

export interface DropStats {
  saves: number
  wins: number
  losses: number
  tried: number
  comments: number
}

export interface PlaceSuggestion {
  id: string
  name: string
  type: string
  streetAddress: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  latitude: number
  longitude: number
  distanceKm: number | null
  mapsUrl: string
  source: 'photon' | 'arcgis'
}

export type LocationState =
  | { status: 'off' }
  | { status: 'locating' }
  | { status: 'on'; lat: number; lon: number; label: string }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'timeout' }

export interface CarouselItem {
  url: string
  type: 'photo' | 'video'
  posterUrl?: string | null
}

/**
 * The drop's media as an ordered carousel (item 1 = cover). Reads the arrays;
 * falls back to the legacy single-media columns for rows written before the
 * carousel migration — so the feed never breaks mid-rollout.
 */
export function dropMedia(d: Pick<Drop, 'media_urls' | 'media_types' | 'media_poster_urls' | 'media_url' | 'media_type' | 'media_poster_url'>): CarouselItem[] {
  const urls = d.media_urls ?? []
  if (urls.length > 0) {
    return urls.map((url, i) => ({
      url,
      type: d.media_types?.[i] ?? 'photo',
      posterUrl: d.media_poster_urls?.[i] ?? null,
    }))
  }
  if (d.media_url) {
    return [{ url: d.media_url, type: d.media_type ?? 'photo', posterUrl: d.media_poster_url ?? null }]
  }
  return []
}

/** Hard cap: 10 items per carousel, like Instagram. */
export const MAX_CAROUSEL_ITEMS = 10
