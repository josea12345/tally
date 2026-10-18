import type { Drop } from '../lib/types'

/** Labeled external link chips: IMDb / Rotten Tomatoes / Spotify / Official site / View location. */
export default function LinkChips({ drop, compact = false }: { drop: Drop; compact?: boolean }) {
  const chips: Array<{ label: string; url: string }> = []
  if (drop.external_url) {
    chips.push({
      label: drop.external_label ?? 'Link',
      url: drop.external_url,
    })
  }
  if (drop.maps_url) {
    chips.push({ label: 'View location', url: drop.maps_url })
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
