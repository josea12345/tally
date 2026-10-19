import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop } from '../lib/types'
import { navigate } from '../App'
import DropGrid from '../components/DropGrid'
import EmptyState from '../components/EmptyState'

export default function Saved({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
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
      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [user])

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
        <DropGrid drops={drops} />
      )}
    </div>
  )
}
