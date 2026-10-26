import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchPublicLists, type ListSummary } from '../lib/lists'
import { navigate } from '../App'
import ListCard from './ListCard'
import EmptyState from './EmptyState'

/**
 * The Lists section of the feed — its own world next to Put Ons.
 * Ranked by mountain likes (popularity), newest breaks ties.
 */
export default function ListsFeed({ refreshNonce }: { refreshNonce: number }) {
  const { user } = useAuth()
  const [lists, setLists] = useState<ListSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      const rows = await fetchPublicLists(user?.id ?? null)
      if (!live) return
      setLists(rows)
      setLoading(false)
    })()
    return () => {
      live = false
    }
  }, [user?.id, refreshNonce])

  if (loading) {
    return (
      <div className="animate-pulse space-y-0">
        {[0, 1].map((i) => (
          <div key={i} className="border-b border-line px-4 py-4">
            <div className="h-5 w-1/2 rounded bg-ink-3" />
            <div className="mt-3 flex gap-1.5">
              <div className="h-20 w-20 rounded-xl bg-ink-3" />
              <div className="h-20 w-20 rounded-xl bg-ink-3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (lists.length === 0) {
    return (
      <EmptyState
        mood="happy"
        title="No lists yet"
        body="Lists are curated runs of drops — someone's whole Miami, in order. Post the first one."
        action={
          <button onClick={() => navigate('/saved')} className="btn-pop press px-6 py-2.5 text-sm">
            Start a list
          </button>
        }
      />
    )
  }

  return (
    <div>
      <div className="flex justify-end px-4 pt-3">
        <button
          onClick={() => navigate('/saved')}
          className="rounded-full border border-line px-4 py-1.5 text-sm font-bold text-fog transition hover:border-sig"
        >
          + New list
        </button>
      </div>
      {lists.map((l) => (
        <ListCard key={l.id} list={l} />
      ))}
    </div>
  )
}
