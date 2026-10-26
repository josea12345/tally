import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import type { Drop } from '../lib/types'
import DropGrid from '../components/DropGrid'

/**
 * Topic page — "entering the place": the name with the average call
 * beside it, the specific location (street address / neighborhood —
 * place-pinned topics are exactly one location), and the posts as a
 * grid of squares with each author's rating on its tile. RLS
 * (is_drop_visible) hides blocked/private drops automatically.
 */
export default function Topic({ topicKey }: { topicKey: string }) {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)
  const [topicFollowing, setTopicFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setTopicFollowing(false)
      return
    }
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('topic_follows')
        .select('topic_key')
        .eq('user_id', user.id)
        .eq('topic_key', topicKey)
        .maybeSingle()
      if (live) setTopicFollowing(!!data)
    })()
    return () => {
      live = false
    }
  }, [user?.id, topicKey])

  const toggleTopicFollow = async () => {
    if (!user || followBusy) return
    setFollowBusy(true)
    if (topicFollowing) {
      const { error } = await supabase
        .from('topic_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('topic_key', topicKey)
      if (!error) setTopicFollowing(false)
    } else {
      const { error } = await supabase
        .from('topic_follows')
        .insert({ user_id: user.id, topic_key: topicKey })
      if (!error) setTopicFollowing(true)
    }
    setFollowBusy(false)
  }

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

  // Location identity: one street address wins; otherwise every
  // neighborhood the drops name (a legacy title-keyed topic can span
  // several), then the city.
  const distinct = (vals: Array<string | null>) => [
    ...new Set(vals.filter(Boolean) as string[]),
  ]
  const addresses = distinct(drops.map((d) => d.street_address))
  const hoods = distinct(drops.map((d) => d.neighborhood))
  const city = drops[0]?.city ?? null
  const locationLine =
    addresses.length === 1
      ? [addresses[0], hoods.length === 1 ? hoods[0] : null, city]
          .filter(Boolean)
          .join(' · ')
      : hoods.length >= 1
        ? [...hoods, city].filter(Boolean).join(' · ')
        : city

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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="wordmark text-3xl leading-tight">{title}</h1>
          {avgLabel != null && (
            <span
              className="rounded-full bg-sig px-3 py-1 font-display text-lg font-black leading-none text-[var(--color-sig-ink)]"
              title="The average of every poster's call for this place"
            >
              {avgLabel}
            </span>
          )}
        </div>

        {locationLine && (
          <p className="mt-1 text-sm font-bold text-mute">{locationLine}</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {avgLabel != null ? (
            <p className="text-sm font-bold text-mute">
              {scored.length} put-on{scored.length === 1 ? '' : 's'}
            </p>
          ) : (
            <p className="text-sm text-mute">No scores yet — be the first call.</p>
          )}
          <div className="ml-auto flex items-center gap-2">
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="press rounded-full border border-line px-4 py-2 text-xs font-black text-fog"
              >
                Directions ↗
              </a>
            )}
            {user && (
              <button
                onClick={toggleTopicFollow}
                disabled={followBusy}
                className={`press rounded-full px-4 py-2 text-xs font-black disabled:opacity-50 ${
                  topicFollowing ? 'bg-sig text-ink' : 'border border-sig/60 text-sig'
                }`}
              >
                {topicFollowing ? 'Following topic ✓' : 'Follow topic'}
              </button>
            )}
          </div>
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
