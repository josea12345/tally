import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Collection } from '../lib/types'

/**
 * Bottom-sheet picker: toggle this drop's membership in my lists,
 * or create a new list with the drop already in it.
 */
export default function AddToListSheet({
  dropId,
  onClose,
}: {
  dropId: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const [lists, setLists] = useState<Collection[]>([])
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let live = true
    ;(async () => {
      const [{ data: cols }, { data: items }] = await Promise.all([
        supabase.from('collections').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('collection_items').select('collection_id').eq('drop_id', dropId),
      ])
      if (!live) return
      setLists((cols ?? []) as Collection[])
      setMemberOf(new Set(((items ?? []) as Array<{ collection_id: string }>).map((i) => i.collection_id)))
      setLoading(false)
    })()
    return () => {
      live = false
    }
  }, [user?.id, dropId])

  const toggle = async (c: Collection) => {
    if (!user) return
    const inList = memberOf.has(c.id)
    setMemberOf((prev) => {
      const next = new Set(prev)
      if (inList) next.delete(c.id)
      else next.add(c.id)
      return next
    })
    const res = inList
      ? await supabase.from('collection_items').delete().eq('collection_id', c.id).eq('drop_id', dropId)
      : await supabase.from('collection_items').insert({ collection_id: c.id, drop_id: dropId })
    if (res.error) {
      setMemberOf((prev) => {
        const next = new Set(prev)
        if (inList) next.add(c.id)
        else next.delete(c.id)
        return next
      })
      setError('Could not update that list — try again.')
    }
  }

  const create = async () => {
    const name = newName.trim()
    if (!user || !name || creating) return
    setCreating(true)
    setError(null)
    const { data, error: cErr } = await supabase
      .from('collections')
      .insert({ owner_id: user.id, name })
      .select('*')
      .single()
    if (cErr || !data) {
      setCreating(false)
      setError('Could not create the list — try again.')
      return
    }
    const col = data as Collection
    const { error: iErr } = await supabase
      .from('collection_items')
      .insert({ collection_id: col.id, drop_id: dropId })
    setCreating(false)
    if (iErr) {
      setError('List created, but adding this drop failed.')
      return
    }
    setLists((prev) => [col, ...prev])
    setMemberOf((prev) => new Set(prev).add(col.id))
    setNewName('')
  }

  if (!user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-t-3xl border border-line bg-ink-2 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-black">Add to list</h3>
          <button onClick={onClose} className="text-sm font-bold text-mute hover:text-fog">
            Done
          </button>
        </div>
        {error && <p className="mb-2 text-xs font-bold text-miss">{error}</p>}
        {loading ? (
          <p className="py-4 text-sm text-mute">Loading your lists…</p>
        ) : lists.length === 0 ? (
          <p className="py-3 text-sm text-mute">No lists yet — make your first one below.</p>
        ) : (
          <ul className="max-h-[40svh] divide-y divide-line overflow-y-auto">
            {lists.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => toggle(c)}
                  className="flex w-full items-center justify-between py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="block text-[11px] text-mute">{c.is_public ? 'Public' : 'Private'}</span>
                  </span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                      memberOf.has(c.id) ? 'border-sig bg-sig text-ink' : 'border-line text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            placeholder="New list name…"
            maxLength={60}
            className="min-w-0 flex-1 rounded-full border border-line bg-ink-3 px-4 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
          />
          <button
            onClick={create}
            disabled={!newName.trim() || creating}
            className="shrink-0 rounded-full bg-sig px-4 py-2.5 text-sm font-black text-ink disabled:opacity-40"
          >
            {creating ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
