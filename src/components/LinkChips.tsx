import type { Drop } from '../lib/types'
import { isPlaceCategory } from '../lib/types'
import { mapsUrlForPlace } from '../lib/geo'
import { safeExternalUrl, honestLinkLabel } from '../lib/urls'

/** Labeled external link chips: IMDb / Rotten Tomatoes / Spotify / Official site / View location. */
export default function LinkChips({ drop, compact = false }: { drop: Drop; compact?: boolean }) {
  const chips: Array<{ label: string; url: string }> = []
  const ext = safeExternalUrl(drop.external_url)
  if (ext) {
    chips.push({
      label: honestLinkLabel(drop.external_label, ext),
      url: ext,
    })
  }
  // Build the Maps link from the place name + address at render time so it
  // opens the PLACE listing — never a bare coordinate pin (and heals old drops).
  // "View location" is only for real places — never for movies, TV, music, recipes.
  if (isPlaceCategory(drop.category) && (drop.street_address || drop.city || drop.maps_url)) {
    const raw =
      drop.street_address || drop.city
        ? mapsUrlForPlace(drop.title, drop.street_address, drop.city)
        : drop.maps_url
    const url = safeExternalUrl(raw)
    if (url) chips.push({ label: 'View location', url })
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
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-3 px-3 py-1.5 text-xs font-bold text-sig transition hover:border-sig"
        >
          <span aria-hidden>↗</span>
          {c.label}
        </a>
      ))}
    </div>
  )
}
