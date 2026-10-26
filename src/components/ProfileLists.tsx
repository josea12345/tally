import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Collection } from '../lib/types'
import { likeStateFor } from '../lib/lists'
import { PeakMark } from './PeakWordmark'
import { navigate } from '../App'

/**
 * Public lists on a profile (plus my own private ones when it's me —
 * RLS decides what comes back). Renders nothing when there are none.
 */
export default function ProfileLists({ ownerId, bare = false }: { ownerId: string; bare?: boolean }) {
  const [lists, setLists] = useState<Array<Collection & { count: number; likes: number }>>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: cols } = await supabase
        .from('collections')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(12)
      const mine = (cols ?? []) as Collection[]
      if (mine.length === 0) {
        if (live) setLists([])
        return
      }
      const { data: items } = await supabase
        .from('collection_items')
        .select('collection_id')
        .in('collection_id', mine.map((c) => c.id))
        .limit(2000)
      const counts = new Map<string, number>()
      for (const i of (items ?? []) as Array<{ collection_id: string }>) {
        counts.set(i.collection_id, (counts.get(i.collection_id) ?? 0) + 1)
      }
      const likes = await likeStateFor(mine.map((c) => c.id), null)
      if (live) setLists(mine.map((c) => ({ ...c, count: counts.get(c.id) ?? 0, likes: likes.get(c.id)?.count ?? 0 })))
    })()
    return () => {
      live = false
    }
  }, [ownerId])

  if (lists.length === 0) return null

  return (
    <div className={bare ? 'px-4 pt-3' : 'mx-auto mt-4 w-full max-w-[430px]'}>
      {!bare && (
        <div className="mb-1.5 text-center text-[9px] font-black uppercase tracking-[0.22em] text-mute">
          Lists
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-2">
        {lists.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => navigate(`/list/${c.id}`)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-ink-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{c.name}</span>
                <span className="flex items-center gap-1 text-[11px] text-mute">
                  {c.count} drop{c.count === 1 ? '' : 's'} · {c.is_public ? 'Public' : 'Private'}
                  {c.likes > 0 && (
                    <span className="flex items-center gap-0.5 font-bold text-sig">
                      · <PeakMark className="h-3 w-3" /> {c.likes}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-mute">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
