import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { navigate } from '../App'
import type { Drop } from '../lib/types'
import DropGrid from '../components/DropGrid'

/**
 * Topic page — "entering the place": the name, its location, the average
 * score across every put-on about it, and the posts as a grid of squares
 * with each author's rating on its tile. RLS (is_drop_visible) hides
 * blocked/private drops automatically.
 */
export default function Topic({ topicKey }: { topicKey: string }) {
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      setLoading(true)
      const { data: rows } = await supabase
        .from('drops')
        .select('*, author:profiles!drops_author_id_fkey(*)')
        .eq('topic_key', topicKey)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!live) return
      setDrops((rows ?? []) as Drop[])
      setLoading(false)
    })()
    return () => {
      live = false
    }
  }, [topicKey])

  const title = drops[0]?.title ?? 'Put-ons'

  // Best-known location: prefer a drop with a street address, then
  // neighborhood, then whatever the newest drop has.
  const locDrop =
    drops.find((d) => d.street_address) ??
    drops.find((d) => d.neighborhood) ??
    drops[0]

  // Average of every author's call — the place's score.
  const scored = drops.filter((d) => d.score != null)
  const avg =
    scored.length > 0
      ? scored.reduce((a, d) => a + (d.score as number), 0) / scored.length
      : null
  const avgLabel = avg == null ? null : (Math.round(avg * 10) / 10).toString()

  const mapsUrl = drops.find((d) => d.maps_url)?.maps_url as string | undefined

  return (
    <div className="screen-in mx-auto max-w-xl pb-24">
      <div className="px-4 pt-5">
        <button
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/'))}
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink-3 text-fog"
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="wordmark text-3xl leading-tight">{title}</h1>

        {(locDrop?.street_address || locDrop?.neighborhood || locDrop?.city) && (
          <p className="mt-1 text-sm font-bold text-mute">
            {[locDrop.street_address, locDrop.neighborhood, locDrop.city]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        <div className="mt-4 flex items-center gap-4">
          {avgLabel != null ? (
            <div className="flex items-center gap-2">
              <span className="font-display text-5xl font-black text-sig">{avgLabel}</span>
              <span className="text-sm font-bold text-mute">
                /10
                <br />
                {scored.length} put-on{scored.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-mute">No scores yet — be the first call.</p>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press ml-auto rounded-full border border-line px-4 py-2 text-xs font-black text-fog"
            >
              Directions ↗
            </a>
          )}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-mute">Loading…</p>
        ) : drops.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-mute">No put-ons here yet.</p>
        ) : (
          <DropGrid drops={drops} showScores />
        )}
      </div>
    </div>
  )
}
