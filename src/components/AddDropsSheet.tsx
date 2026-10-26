import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop } from '../lib/types'
import { dropMedia } from '../lib/types'

/**
 * Owner's add-drops picker for a list page: select from posts you've
 * SAVED (your Try list) plus your own drops. Tap toggles membership —
 * adds append at the next position (0053), removals leave the rest of
 * the order untouched. (Jose's ask, 2026-10-26: "select from posts
 * ive saved through here" — from the list page itself.)
 */
export default function AddDropsSheet({
  listId,
  onClose,
}: {
  listId: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const [candidates, setCandidates] = useState<Drop[] | null>(null)
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set())
  const [nextPos, setNextPos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let live = true
    ;(async () => {
      const dropSel = '*, author:profiles!drops_author_id_fkey(*)'
      const [{ data: saveRows }, { data: own }, { data: items }] = await Promise.all([
        supabase.from('saves').select('drop_id').eq('user_id', user.id).limit(200),
        supabase.from('drops').select(dropSel).eq('author_id', user.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('collection_items').select('drop_id').eq('collection_id', listId).limit(500),
      ])
      const saveIds = ((saveRows ?? []) as Array<{ drop_id: string }>).map((r) => r.drop_id)
      let saved: Drop[] = []
      if (saveIds.length > 0) {
        const { data } = await supabase.from('drops').select(dropSel).in('id', saveIds).limit(200)
        saved = (data ?? []) as unknown as Drop[]
      }
      if (!live) return
      // Saved first (that's the ask), then my own drops; de-duped.
      const byId = new Map<string, Drop>()
      for (const d of [...saved, ...((own ?? []) as unknown as Drop[])]) {
        if (!byId.has(d.id)) byId.set(d.id, d)
      }
      const member = new Set(((items ?? []) as Array<{ drop_id: string }>).map((i) => i.drop_id))
      setCandidates([...byId.values()])
      setMemberOf(member)
      setNextPos(member.size)
    })()
    return () => {
      live = false
    }
  }, [user?.id, listId])

  const toggle = async (d: Drop) => {
    if (!user || busyId) return
    const inList = memberOf.has(d.id)
    setBusyId(d.id)
    setError(null)
    if (inList) {
      const { error } = await supabase
        .from('collection_items')
        .delete()
        .eq('collection_id', listId)
        .eq('drop_id', d.id)
      if (error) setError('Could not remove that — try again.')
      else
        setMemberOf((prev) => {
          const next = new Set(prev)
          next.delete(d.id)
          return next
        })
    } else {
      const { error } = await supabase
        .from('collection_items')
        .insert({ collection_id: listId, drop_id: d.id, position: nextPos })
      if (error) setError('Could not add that — try again.')
      else {
        setMemberOf((prev) => new Set(prev).add(d.id))
        setNextPos((p) => p + 1)
      }
    }
    setBusyId(null)
  }

  if (!user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-t-3xl border border-line bg-ink-2 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-black">Add drops</h3>
          <button onClick={onClose} className="text-sm font-bold text-mute hover:text-fog">
            Done
          </button>
        </div>
        <p className="mb-2 text-xs text-mute">From your Try list and your own drops. Adds go to the end of the run.</p>
        {error && <p className="mb-2 text-xs font-bold text-miss">{error}</p>}
        {candidates === null ? (
          <p className="py-4 text-sm text-mute">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="py-3 text-sm text-mute">
            Nothing to pick from yet — save some drops (the flag on any post) or post your own, and they'll show up here.
          </p>
        ) : (
          <ul className="max-h-[46svh] divide-y divide-line overflow-y-auto">
            {candidates.map((d) => {
              const cover = dropMedia(d)[0]
              const coverUrl = cover ? (cover.type === 'video' ? cover.posterUrl : cover.url) : null
              const inList = memberOf.has(d.id)
              return (
                <li key={d.id}>
                  <button
                    onClick={() => void toggle(d)}
                    disabled={busyId === d.id}
                    className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-60"
                  >
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-3 text-xs font-black text-sig">
                        {d.score ?? '•'}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{d.title}</span>
                      <span className="block text-[11px] text-mute">@{d.author?.username ?? '?'}</span>
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                        inList ? 'border-sig bg-sig text-ink' : 'border-line text-mute'
                      }`}
                    >
                      {inList ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
