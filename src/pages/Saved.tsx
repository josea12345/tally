import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop } from '../lib/types'
import { CATEGORY_GROUPS } from '../lib/types'
import { navigate } from '../App'
import DropGrid from '../components/DropGrid'
import EmptyState from '../components/EmptyState'

type Sort = 'recent' | 'oldest' | 'top'

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'top', label: 'Top rated' },
]

export default function Saved({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState('all')
  const [sort, setSort] = useState<Sort>('recent')

  useEffect(() => {
    if (!user) return
    let live = true
    const load = async () => {
      const { data } = await supabase
        .from('saves')
        .select('drop:drops(*, author:profiles(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!live) return
      const list = ((data ?? []) as Array<{ drop: Drop }>).map((r) => r.drop).filter(Boolean)
      setDrops(list)
      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [user])

  const visible = useMemo(() => {
    let list = drops
    if (group !== 'all') {
      const g = CATEGORY_GROUPS.find((x) => x.id === group)
      if (g) list = list.filter((d) => g.categories.includes(d.category))
    }
    if (sort === 'recent') return list
    const sorted = [...list]
    if (sort === 'oldest') sorted.reverse()
    else sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    return sorted
  }, [drops, group, sort])

  if (loading) {
    return (
      <div className="animate-pulse px-4 py-6">
        <div className="mb-3 h-8 w-1/2 rounded bg-ink-3" />
        <div className="h-4 w-full rounded bg-ink-3" />
      </div>
    )
  }

  return (
    <div>
      {!bare && (
        <div className="border-b border-line px-4 pb-3 pt-5">
          <h1 className="wordmark text-3xl">Tallies</h1>
          <p className="text-sm text-mute">Everything people put you on to.</p>
        </div>
      )}
      {drops.length === 0 ? (
        <EmptyState
          title="Nothing in the vault yet"
          body="When someone puts you on to something, tally it here — your shortlist of things worth trying."
          mood="happy"
          action={
            <button onClick={() => navigate('/')} className="btn-pop press px-6 py-2.5 text-sm">
              Find a put-on
            </button>
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 pb-2 pt-3">
            <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
              {[{ id: 'all', label: 'All' }, ...CATEGORY_GROUPS].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGroup(g.id)}
                  className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
                    group === g.id ? 'bg-sig text-ink' : 'border border-line bg-ink-2 text-mute'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 px-4 pb-3">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-widest text-mute">Sort</span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`press rounded-full px-3 py-1.5 text-xs font-black transition ${
                  sort === s.id ? 'bg-fog text-ink' : 'text-mute hover:text-fog'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-mute">
              Nothing here under this filter yet.
            </p>
          ) : (
            <DropGrid drops={visible} showScores={sort === 'top'} />
          )}
        </>
      )}
    </div>
  )
}
