import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats } from '../lib/types'
import { navigate } from '../App'
import DropCard from '../components/DropCard'
import EmptyState from '../components/EmptyState'

export default function Saved() {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
  const [stats, setStats] = useState<Map<string, DropStats>>(new Map())
  const [loading, setLoading] = useState(true)

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
      const m = new Map<string, DropStats>()
      for (const d of list) {
        const [{ count: s }, { data: vts }] = await Promise.all([
          supabase.from('saves').select('id', { count: 'exact', head: true }).eq('drop_id', d.id),
          supabase.from('verdicts').select('verdict').eq('drop_id', d.id).limit(5000),
        ])
        const vs = (vts ?? []) as Array<{ verdict: string | null }>
        m.set(d.id, {
          saves: s ?? 0,
          hits: vs.filter((v) => v.verdict === 'HIT').length,
          misses: vs.filter((v) => v.verdict === 'MISS').length,
          tried: 0,
        })
      }
      if (live) {
        setStats(m)
        setLoading(false)
      }
    }
    load()
    return () => {
      live = false
    }
  }, [user])

  const unsave = async (dropId: string) => {
    if (!user) return
    await supabase.from('saves').delete().eq('user_id', user.id).eq('drop_id', dropId)
    setDrops((ds) => ds.filter((d) => d.id !== dropId))
  }

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
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="text-2xl font-black tracking-tight">Saved</h1>
        <p className="text-sm text-mute">Everything people put you on to.</p>
      </div>
      {drops.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          body="When someone puts you on to something, save it here — your shortlist of things worth trying."
          action={
            <button onClick={() => navigate('/')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
              Find a put-on
            </button>
          }
        />
      ) : (
        drops.map((d) => (
          <DropCard
            key={d.id}
            drop={d}
            stats={stats.get(d.id) ?? { saves: 0, hits: 0, misses: 0, tried: 0 }}
            saved
            onToggleSave={() => unsave(d.id)}
          />
        ))
      )}
    </div>
  )
}
