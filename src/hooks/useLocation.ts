import { useCallback, useEffect, useState } from 'react'
import type { LocationState } from '../lib/types'
import {
  cacheLocation,
  cityCoords,
  clearCachedLocation,
  getCachedLocation,
  locateOnce,
  reverseGeocode,
} from '../lib/geo'

export interface EffectiveLocation {
  lat: number
  lon: number
  label: string
  source: 'gps' | 'city'
}

/**
 * Device location with honest states. Primary = GPS ("Locate me"), fallback = profile city.
 */
export function useDeviceLocation(profileCity: string | null | undefined) {
  const [state, setState] = useState<LocationState>(() => {
    const c = getCachedLocation()
    return c ? { status: 'on', lat: c.lat, lon: c.lon, label: c.label } : { status: 'off' }
  })

  const effective: EffectiveLocation =
    state.status === 'on'
      ? { lat: state.lat, lon: state.lon, label: state.label, source: 'gps' }
      : (() => {
          const c = cityCoords(profileCity)
          return { lat: c.lat, lon: c.lon, label: profileCity?.trim() || 'Miami', source: 'city' as const }
        })()

  const locate = useCallback(async () => {
    setState({ status: 'locating' })
    const r = await locateOnce()
    if (!r.ok) {
      setState({ status: r.reason ?? 'unavailable' })
      return
    }
    const label = await reverseGeocode(r.lat!, r.lon!)
    cacheLocation(r.lat!, r.lon!, label)
    setState({ status: 'on', lat: r.lat!, lon: r.lon!, label })
  }, [])

  const useCity = useCallback(() => {
    clearCachedLocation()
    setState({ status: 'off' })
  }, [])

  // Auto-restore cached GPS on mount is handled by the initializer above.
  useEffect(() => {}, [])

  return { state, effective, locate, useCity }
}
