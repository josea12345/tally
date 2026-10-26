import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Collection, Drop } from '../lib/types'
import { dropMedia } from '../lib/types'
import { navigate } from '../App'

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
    let position = 0
    if (!inList) {
      const { count } = await supabase
        .from('collection_items')
        .select('drop_id', { count: 'exact', head: true })
        .eq('collection_id', c.id)
      position = count ?? 0
    }
    const res = inList
      ? await supabase.from('collection_items').delete().eq('collection_id', c.id).eq('drop_id', dropId)
      : await supabase.from('collection_items').insert({ collection_id: c.id, drop_id: dropId, position })
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

  // ---- Build-a-list mode: stack drops (mine + ones I saved) in a
  // deliberate order and post the run as a public list. The drop this
  // sheet was opened from starts as pick #1.
  const [build, setBuild] = useState(false)
  const [candidates, setCandidates] = useState<Drop[] | null>(null)
  const [picks, setPicks] = useState<Drop[]>([])
  const [buildName, setBuildName] = useState('')
  const [posting, setPosting] = useState(false)

  const enterBuild = async () => {
    if (!user) return
    setBuild(true)
    setError(null)
    const dropSel = '*, author:profiles!drops_author_id_fkey(*)'
    const [{ data: anchor }, { data: own }, { data: saveRows }] = await Promise.all([
      supabase.from('drops').select(dropSel).eq('id', dropId).maybeSingle(),
      supabase.from('drops').select(dropSel).eq('author_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('saves').select('drop_id').eq('user_id', user.id).limit(100),
    ])
    const saveIds = ((saveRows ?? []) as Array<{ drop_id: string }>).map((r) => r.drop_id)
    let saved: Drop[] = []
    if (saveIds.length > 0) {
      const { data } = await supabase.from('drops').select(dropSel).in('id', saveIds).limit(100)
      saved = (data ?? []) as unknown as Drop[]
    }
    const byId = new Map<string, Drop>()
    for (const d of [...((own ?? []) as unknown as Drop[]), ...saved]) byId.set(d.id, d)
    const anchorDrop = anchor as unknown as Drop | null
    if (anchorDrop) {
      byId.set(anchorDrop.id, anchorDrop)
      setPicks([anchorDrop])
    }
    setCandidates([...byId.values()])
  }

  const togglePick = (d: Drop) => {
    setPicks((prev) =>
      prev.some((p) => p.id === d.id) ? prev.filter((p) => p.id !== d.id) : prev.length >= 50 ? prev : [...prev, d],
    )
  }

  const postList = async () => {
    const n = buildName.trim()
    if (!user || posting) return
    if (!n) {
      setError('Give the list a name first.')
      return
    }
    if (picks.length === 0) {
      setError('Tap at least one drop to stack it.')
      return
    }
    setPosting(true)
    setError(null)
    const { data, error: cErr } = await supabase
      .from('collections')
      .insert({ owner_id: user.id, name: n })
      .select('*')
      .single()
    if (cErr || !data) {
      setPosting(false)
      setError('Could not post the list — try again.')
      return
    }
    const col = data as Collection
    const { error: iErr } = await supabase.from('collection_items').insert(
      picks.map((d, i) => ({ collection_id: col.id, drop_id: d.id, position: i })),
    )
    setPosting(false)
    if (iErr) {
      setError('List created, but stacking the drops failed.')
      return
    }
    onClose()
    navigate(`/list/${col.id}`)
  }

  if (!user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-t-3xl border border-line bg-ink-2 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-black">{build ? 'Build a list' : 'Add to list'}</h3>
          <button onClick={onClose} className="text-sm font-bold text-mute hover:text-fog">
            Done
          </button>
        </div>
        {error && <p className="mb-2 text-xs font-bold text-miss">{error}</p>}
        {build ? (
          <div>
            <p className="mb-2 text-xs text-mute">Tap drops in the order you want them — the numbers are the run.</p>
            <input
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
              placeholder="List name — e.g. Best croquetas in Miami"
              maxLength={60}
              className="mb-3 w-full rounded-full border border-line bg-ink-3 px-4 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
            />
            {candidates === null ? (
              <p className="py-4 text-sm text-mute">Loading drops…</p>
            ) : candidates.length === 0 ? (
              <p className="py-3 text-sm text-mute">No drops to stack yet — post or save a few first.</p>
            ) : (
              <ul className="max-h-[36svh] divide-y divide-line overflow-y-auto">
                {candidates.map((d) => {
                  const pickIdx = picks.findIndex((x) => x.id === d.id)
                  const cover = dropMedia(d)[0]
                  const coverUrl = cover ? (cover.type === 'video' ? cover.posterUrl : cover.url) : null
                  return (
                    <li key={d.id}>
                      <button onClick={() => togglePick(d)} className="flex w-full items-center gap-3 py-2.5 text-left">
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
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                            pickIdx >= 0 ? 'border-sig bg-sig text-ink' : 'border-line text-transparent'
                          }`}
                        >
                          {pickIdx >= 0 ? pickIdx + 1 : '·'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button
              onClick={postList}
              disabled={posting || picks.length === 0}
              className="btn-pop press mt-4 w-full py-3 text-sm"
            >
              {posting ? 'Posting…' : `Post list${picks.length > 0 ? ` · ${picks.length} drop${picks.length === 1 ? '' : 's'}` : ''}`}
            </button>
            <button onClick={() => setBuild(false)} className="mt-2 w-full text-center text-xs font-bold text-mute">
              ← Back to my lists
            </button>
          </div>
        ) : loading ? (
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
        {!build && (
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
        )}
        {!build && (
          <button onClick={() => void enterBuild()} className="mt-3 w-full text-center text-xs font-bold text-sig">
            Building a ranked list? Stack drops in order →
          </button>
        )}
      </div>
    </div>
  )
}
