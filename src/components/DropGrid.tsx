import type { Drop } from '../lib/types'
import { dropMedia } from '../lib/types'
import { navigate } from '../App'

/** Instagram-style 3-column grid of drop covers. Tapping a tile opens the drop. */
export default function DropGrid({ drops, showScores = false }: { drops: Drop[]; showScores?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {drops.map((d) => {
        const items = dropMedia(d)
        const cover = items[0]
        return (
          <button
            key={d.id}
            onClick={() => navigate(`/drop/${d.id}`)}
            className="relative aspect-square overflow-hidden bg-ink-2"
            aria-label={d.title}
          >
            {cover ? (
              cover.type === 'video' ? (
                cover.posterUrl ? (
                  <img src={cover.posterUrl} alt={d.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <video src={cover.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                )
              ) : (
                <img src={cover.url} alt={d.title} loading="lazy" className="h-full w-full object-cover" />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-ink-3 p-2">
                <span className="line-clamp-4 text-center text-[11px] font-bold leading-tight text-fog/80">
                  {d.title}
                </span>
              </div>
            )}
            {showScores && d.score != null && (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-black text-sig backdrop-blur-sm">
                {d.score}/10
              </span>
            )}
            {items.length > 1 && (
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <rect x="9" y="9" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" strokeLinecap="round" />
                </svg>
              </span>
            )}
            {items.length === 1 && cover?.type === 'video' && (
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
