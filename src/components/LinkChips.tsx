import type { Drop } from '../lib/types'
import { mapsUrlForPlace } from '../lib/geo'

/** Labeled external link chips: IMDb / Rotten Tomatoes / Spotify / Official site / View location. */
export default function LinkChips({ drop, compact = false }: { drop: Drop; compact?: boolean }) {
  const chips: Array<{ label: string; url: string }> = []
  if (drop.external_url) {
    chips.push({
      label: drop.external_label ?? 'Link',
      url: drop.external_url,
    })
  }
  // Build the Maps link from the place name + address at render time so it
  // opens the PLACE listing — never a bare coordinate pin (and heals old drops).
  if (drop.street_address || drop.city || drop.maps_url) {
    const url =
      drop.street_address || drop.city
        ? mapsUrlForPlace(drop.title, drop.street_address, drop.city)
        : (drop.maps_url as string)
    chips.push({ label: 'View location', url })
  }
  if (chips.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-3'}`}>
      {chips.map((c) => (
        <a
          key={c.label}
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-3 px-3 py-1.5 text-xs font-bold text-lime transition hover:border-lime"
        >
          <span aria-hidden>↗</span>
          {c.label}
        </a>
      ))}
    </div>
  )
}
