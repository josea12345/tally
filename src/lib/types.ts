export type Category =
  | 'restaurants'
  | 'cafes'
  | 'bars'
  | 'shops'
  | 'places'
  | 'movies'
  | 'tv'
  | 'music'

export const PLACE_CATEGORIES: Category[] = ['restaurants', 'cafes', 'bars', 'shops', 'places']
export const MEDIA_CATEGORIES: Category[] = ['movies', 'tv', 'music']
export const ALL_CATEGORIES: Category[] = [...PLACE_CATEGORIES, ...MEDIA_CATEGORIES]

export const CATEGORY_LABELS: Record<Category, string> = {
  restaurants: 'Restaurants',
  cafes: 'Cafés',
  bars: 'Bars',
  shops: 'Shops',
  places: 'Places',
  movies: 'Movies',
  tv: 'TV Shows',
  music: 'Music',
}

export function isPlaceCategory(c: Category): boolean {
  return PLACE_CATEGORIES.includes(c)
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  city: string | null
  avatar_url: string | null
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
  media_url: string | null
  media_type: 'photo' | 'video' | null
  external_url: string | null
  external_label: 'IMDb' | 'Rotten Tomatoes' | 'Spotify' | 'Official site' | null
  tip: string | null
  where_to: string | null
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
