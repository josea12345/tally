import { useRef, useState } from 'react'
import type { CarouselItem } from '../lib/types'

/**
 * Instagram-style swipeable media carousel. Scroll-snap track with a "1/4"
 * counter and tappable dots below. The parent renders each slide and can pass
 * an overlay (e.g. the feed's action bar) that sits over the media only.
 */
export default function MediaCarousel({
  items,
  renderItem,
  overlay,
  flush = false,
  topBadge,
}: {
  items: CarouselItem[]
  renderItem: (item: CarouselItem, index: number) => React.ReactNode
  overlay?: React.ReactNode
  /** Full-bleed mode: no rounding or border (edge-to-edge feed media). */
  flush?: boolean
  /** Node pinned to the media's top-left (e.g. the score badge); the counter stacks below it. */
  topBadge?: React.ReactNode
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)

  const onScroll = () => {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    setIndex(Math.min(items.length - 1, Math.round(el.scrollLeft / el.clientWidth)))
  }

  const go = (i: number) => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  if (items.length === 0) return null

  return (
    <div>
      <div className={`relative overflow-hidden bg-black ${flush ? '' : 'rounded-2xl border border-line'}`}>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {items.map((it, i) => (
            <div key={`${it.url}-${i}`} className={`w-full shrink-0 snap-center ${flush ? 'aspect-[9/16]' : ''}`}>
              {renderItem(it, i)}
            </div>
          ))}
        </div>
        {(topBadge || items.length > 1) && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
            {topBadge}
            {items.length > 1 && (
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-black tabular-nums text-white backdrop-blur-sm">
                {index + 1}/{items.length}
              </span>
            )}
          </div>
        )}
        {overlay}
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-lime' : 'w-1.5 bg-mute/50 hover:bg-mute'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
