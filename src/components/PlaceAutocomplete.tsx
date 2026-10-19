import { useEffect, useRef, useState } from 'react'
import type { Category, PlaceSuggestion } from '../lib/types'
import { searchPlaces } from '../lib/places'
import { formatMiles } from '../lib/format'

interface Props {
  category: Category
  origin: { lat: number; lon: number } | null
  originLabel: string
  value: string
  onChange: (v: string) => void
  onSelect: (s: PlaceSuggestion) => void
  pinned: PlaceSuggestion | null
  onUnpin: () => void
}

/** Tap-to-select place autocomplete for the composer. */
export default function PlaceAutocomplete({ category, origin, originLabel, value, onChange, onSelect, pinned, onUnpin }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sugs, setSugs] = useState<PlaceSuggestion[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length < 2 || !origin) {
      setSugs([])
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const r = await searchPlaces(value.trim(), category, origin)
        setSugs(r)
        setOpen(true)
      } catch {
        setSugs([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, category, origin])

  if (pinned) {
    return (
      <div className="rounded-2xl border border-sig/60 bg-ink-2 p-4">
        <div className="mb-1 text-xs font-black uppercase tracking-widest text-sig">Location pinned</div>
        <div className="font-black">{pinned.name}</div>
        <div className="text-sm text-fog/90">
          {[pinned.streetAddress, pinned.neighborhood, pinned.city, pinned.state].filter(Boolean).join(' · ')}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <a href={pinned.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-sig">
            Preview on Maps ↗
          </a>
          <button onClick={onUnpin} className="text-xs font-bold text-mute hover:text-miss">
            Remove pin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => sugs.length > 0 && setOpen(true)}
        placeholder="Name the spot…"
        className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-4 text-lg font-bold outline-none placeholder:text-mute/60 focus:border-sig"
        autoComplete="off"
      />
      {origin && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-mute">
          <span className="text-sig">◉</span> Suggestions come from around <b className="text-fog">{originLabel}</b> —
          your location, not just your profile city.
        </p>
      )}
      {open && (loading || sugs.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-2xl">
          {loading && <div className="px-4 py-3 text-sm text-mute">Finding real {category}…</div>}
          {!loading &&
            sugs.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onSelect(s)
                  setOpen(false)
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-ink-3"
              >
                <span className="mt-0.5 text-sig">◉</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold">{s.name}</span>
                    {formatMiles(s.distanceKm) && (
                      <span className="shrink-0 rounded-full bg-sig/15 px-2 py-0.5 text-[11px] font-black text-sig">
                        {formatMiles(s.distanceKm)}
                      </span>
                    )}
                  </span>
                  {s.streetAddress && <span className="block truncate text-sm text-fog/90">{s.streetAddress}</span>}
                  <span className="block truncate text-xs text-mute">
                    {[s.neighborhood, s.city, s.state].filter(Boolean).join(' · ')}
                    {s.type ? ` · ${s.type}` : ''}
                  </span>
                </span>
              </button>
            ))}
          {!loading && sugs.length === 0 && (
            <div className="px-4 py-3 text-sm text-mute">No matches — keep typing or enter it manually.</div>
          )}
        </div>
      )}
    </div>
  )
}
