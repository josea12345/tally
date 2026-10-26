import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop } from '../lib/types'
import { dropMedia } from '../lib/types'
import { hiResArtwork } from './ArtworkImage'
import { navigate } from '../App'

const COLS =
  '*, author:profiles!drops_author_id_fkey(*)'

/**
 * "More like this" rail for the drop page: same topic first, then
 * same-category recent drops. Real drops only; renders nothing when
 * there is nothing related yet.
 */
export default function RelatedDrops({ drop }: { drop: Drop }) {
  const [items, setItems] = useState<Drop[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const out: Drop[] = []
      const seen = new Set<string>([drop.id])
      if (drop.topic_key) {
        const { data } = await supabase
          .from('drops')
          .select(COLS)
          .eq('topic_key', drop.topic_key)
          .neq('id', drop.id)
          .order('created_at', { ascending: false })
          .limit(6)
        for (const d of (data ?? []) as Drop[]) {
          if (!seen.has(d.id)) {
            seen.add(d.id)
            out.push(d)
          }
        }
      }
      if (out.length < 6) {
        const { data } = await supabase
          .from('drops')
          .select(COLS)
          .eq('category', drop.category)
          .neq('id', drop.id)
          .order('created_at', { ascending: false })
          .limit(12)
        for (const d of (data ?? []) as Drop[]) {
          if (out.length >= 6) break
          if (!seen.has(d.id)) {
            seen.add(d.id)
            out.push(d)
          }
        }
      }
      if (live) setItems(out)
    })()
    return () => {
      live = false
    }
  }, [drop.id, drop.topic_key, drop.category])

  if (items.length === 0) return null

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-black">More like this</h2>
      <div className="rail-scroll flex gap-3 overflow-x-auto pb-1">
        {items.map((d) => {
          const cover = dropMedia(d)[0]
          const thumb = cover
            ? cover.type === 'video'
              ? cover.posterUrl ?? undefined
              : hiResArtwork(cover.url, 'w500')
            : undefined
          return (
            <button
              key={d.id}
              onClick={() => navigate(`/drop/${d.id}`)}
              className="w-[120px] shrink-0 text-left"
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  className="h-[150px] w-[120px] rounded-2xl bg-ink-3 object-cover"
                />
              ) : (
                <span className="flex h-[150px] w-[120px] items-center justify-center rounded-2xl bg-ink-3 px-2 text-center text-xs font-bold text-mute">
                  {d.title}
                </span>
              )}
              <span className="mt-1.5 line-clamp-2 block text-xs font-bold leading-tight">{d.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-mute">
                {d.score != null && <span className="font-bold text-sig">{d.score} · </span>}@
                {d.author?.username ?? '?'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
