import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Collection } from '../lib/types'
import { navigate } from '../App'

/**
 * "Your lists" section for the Tallies page: my collections with item
 * counts, tap through to the list page, plus inline list creation.
 */
export default function MyLists() {
  const { user } = useAuth()
  const [lists, setLists] = useState<Array<Collection & { count: number }>>([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let live = true
    ;(async () => {
      const { data: cols } = await supabase
        .from('collections')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      const mine = (cols ?? []) as Collection[]
      let counts = new Map<string, number>()
      if (mine.length > 0) {
        const { data: items } = await supabase
          .from('collection_items')
          .select('collection_id')
          .in('collection_id', mine.map((c) => c.id))
          .limit(2000)
        for (const i of (items ?? []) as Array<{ collection_id: string }>) {
          counts.set(i.collection_id, (counts.get(i.collection_id) ?? 0) + 1)
        }
      }
      if (!live) return
      setLists(mine.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })))
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [user?.id])

  const create = async () => {
    const n = name.trim()
    if (!user || !n || busy) return
    setBusy(true)
    const { data } = await supabase
      .from('collections')
      .insert({ owner_id: user.id, name: n })
      .select('*')
      .single()
    setBusy(false)
    if (data) {
      const col = data as Collection
      setLists((prev) => [{ ...col, count: 0 }, ...prev])
      setName('')
      setCreating(false)
      navigate(`/list/${col.id}`)
    }
  }

  if (!user || !loaded) return null

  return (
    <div className="border-b border-line px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-mute">Your lists</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-xs font-black text-sig">
            + New list
          </button>
        )}
      </div>
      {creating && (
        <div className="mb-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            placeholder="List name — Date night, Miami essentials…"
            maxLength={60}
            autoFocus
            className="min-w-0 flex-1 rounded-full border border-line bg-ink-2 px-4 py-2 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
          />
          <button
            onClick={create}
            disabled={!name.trim() || busy}
            className="shrink-0 rounded-full bg-sig px-4 py-2 text-sm font-black text-ink disabled:opacity-40"
          >
            Create
          </button>
          <button
            onClick={() => setCreating(false)}
            className="shrink-0 rounded-full border border-line px-3 py-2 text-sm font-bold text-mute"
          >
            ✕
          </button>
        </div>
      )}
      {lists.length === 0 && !creating ? (
        <p className="text-sm text-mute">
          Group your tallies into named lists — date night, Miami essentials, watch later.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {lists.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => navigate(`/list/${c.id}`)}
                className="flex w-full items-center justify-between py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{c.name}</span>
                  <span className="block text-[11px] text-mute">
                    {c.count} drop{c.count === 1 ? '' : 's'} · {c.is_public ? 'Public' : 'Private'}
                  </span>
                </span>
                <span className="shrink-0 text-mute">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
