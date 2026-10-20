import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Drop } from '../lib/types'
import { dropMedia } from '../lib/types'
import { haversineKm, type LatLon } from '../lib/geo'
import { navigate } from '../App'

/**
 * Near-me map: dark CARTO basemap (free, keyless) with a pin per
 * coordinate-carrying drop. Tapping a pin selects the drop and shows
 * its card under the map — the card is the way through to the drop.
 */
export default function DropMap({
  drops,
  center,
}: {
  drops: Drop[]
  center: LatLon
}) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const [selected, setSelected] = useState<Drop | null>(null)
  const pinned = drops.filter((d) => d.latitude != null && d.longitude != null)

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: false })
    map.setView([center.lat, center.lon], 12)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lon])
  }, [center.lat, center.lon])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const m of markersRef.current) m.remove()
    markersRef.current = pinned.map((d) => {
      const icon = L.divIcon({
        className: 'tally-pin-wrap',
        html: `<div class="tally-pin${selected?.id === d.id ? ' tally-pin-sel' : ''}">${d.score != null ? d.score : '•'}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })
      const marker = L.marker([d.latitude!, d.longitude!], { icon }).addTo(map)
      marker.on('click', () => setSelected(d))
      return marker
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drops, selected?.id])

  const cover = selected ? dropMedia(selected)[0] : undefined
  const distMi = selected
    ? haversineKm(center, { lat: selected.latitude ?? center.lat, lon: selected.longitude ?? center.lon }) * 0.621371
    : 0

  return (
    <div className="px-4 pt-3">
      <div ref={elRef} className="h-[58svh] w-full overflow-hidden rounded-3xl border border-line" />
      {selected ? (
        <button
          onClick={() => navigate(`/drop/${selected.id}`)}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-sig/50 bg-ink-2 p-3 text-left transition hover:border-sig"
        >
          {cover ? (
            <img
              src={cover.type === 'video' ? cover.posterUrl ?? '' : cover.url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl bg-black object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-lg font-black text-sig">
              {selected.score ?? '•'}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{selected.title}</span>
            <span className="block truncate text-xs text-mute">
              @{selected.author?.username ?? '?'} · {distMi < 0.1 ? 'right here' : `${distMi.toFixed(1)} mi`}
              {selected.score != null && <span className="font-bold text-sig"> · their call {selected.score}/10</span>}
            </span>
          </span>
          <span className="shrink-0 text-lg font-black text-sig">→</span>
        </button>
      ) : (
        <p className="mt-3 text-center text-xs text-mute">
          {pinned.length === 0
            ? 'No pinned drops near you yet — place drops with a location show up here.'
            : `${pinned.length} pinned drop${pinned.length === 1 ? '' : 's'} — tap a pin to preview it.`}
        </p>
      )}
    </div>
  )
}
