import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop } from '../lib/types'
import { dropMedia } from '../lib/types'
import { formatScore } from '../lib/ratings'
import { navigate } from '../App'
import { PeakMark } from './PeakWordmark'

interface SpreadRow {
  drop_id: string
  n: number
  lo: number
  hi: number
  std: number
}

/**
 * Most Contested: the drops raters argue about — wide score spread,
 * nothing in the middle. Pure computation over real ratings (needs at
 * least 3); renders nothing until some drop honestly qualifies.
 */
export default function ContestedRail() {
  const [items, setItems] = useState<Array<{ drop: Drop; s: SpreadRow }>>([])

  useEffect(() => {
    let live = true
    void (async () => {
      const { data } = await supabase
        .from('drop_rating_spread')
        .select('drop_id,n,lo,hi,std')
        .gte('n', 3)
        .order('std', { ascending: false })
        .limit(10)
      const rows = (data ?? []) as SpreadRow[]
      if (!live || rows.length === 0) return
      const { data: drops } = await supabase
        .from('drops')
        .select('*, author:profiles!drops_author_id_fkey(*)')
        .in('id', rows.map((r) => r.drop_id))
      if (!live) return
      const byId = new Map(((drops ?? []) as Drop[]).map((d) => [d.id, d]))
      setItems(
        rows
          .map((s) => ({ s, drop: byId.get(s.drop_id) }))
          .filter((x): x is { drop: Drop; s: SpreadRow } => !!x.drop),
      )
    })()
    return () => {
      live = false
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xs font-black uppercase tracking-widest text-mute">Most contested</span>
        <span className="doodle text-lg leading-none text-lilac">nobody agrees on these</span>
      </div>
      <div className="rail-scroll flex gap-3 overflow-x-auto pb-1">
        {items.map(({ drop, s }) => {
          const first = dropMedia(drop)[0]
          const cover = first ? (first.type === 'video' ? first.posterUrl : first.url) : null
          return (
            <button
              key={drop.id}
              onClick={() => navigate(`/drop/${drop.id}`)}
              className="press w-36 shrink-0 text-left"
            >
              <span className="relative block aspect-square w-36 overflow-hidden rounded-2xl bg-ink-3">
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-mute/40">
                    <PeakMark className="h-10 w-auto" />
                  </span>
                )}
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-black text-white">
                  {formatScore(Number(s.lo))} – {formatScore(Number(s.hi))}
                </span>
              </span>
              <span className="mt-1.5 block truncate text-[13px] font-bold leading-tight">{drop.title}</span>
              <span className="block truncate text-[11px] text-mute">
                @{drop.author?.username ?? '?'} · {s.n} ratings
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
