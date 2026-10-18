import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop, Profile, Verdict } from '../lib/types'
import { tasteTwins, type TasteTwin } from '../lib/stats'
import { Avatar, navigate } from '../App'
import FollowButton from './FollowButton'

/** People who HIT what you HIT — a discovery graph from verdicts. */
export default function TasteTwins({ myId }: { myId: string }) {
  const [twins, setTwins] = useState<TasteTwin[] | null>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      const [{ data: verdicts }, { data: drops }, { data: profiles }] = await Promise.all([
        supabase.from('verdicts').select('*').eq('verdict', 'HIT').limit(3000),
        supabase.from('drops').select('id,title').limit(3000),
        supabase.from('profiles').select('*').limit(500),
      ])
      if (!live) return
      const vs = (verdicts ?? []) as Verdict[]
      const myHits = new Set(vs.filter((v) => v.user_id === myId).map((v) => v.drop_id))
      if (myHits.size === 0) {
        setTwins([])
        return
      }
      const dropById = new Map(((drops ?? []) as Drop[]).map((d) => [d.id, d]))
      const profById = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))
      setTwins(tasteTwins(myId, myHits, vs, dropById, profById))
    }
    load()
    return () => {
      live = false
    }
  }, [myId])

  if (twins === null) return <p className="py-4 text-center text-sm text-mute">Finding your taste twins…</p>
  if (twins.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-mute">
        Call HIT on a few drops and your taste twins will show up here.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {twins.map((t) => (
        <li key={t.profile.id} className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 p-3">
          <button onClick={() => navigate(`/profile/${t.profile.id}`)}>
            <Avatar url={t.profile.avatar_url} name={t.profile.display_name ?? t.profile.username} size={44} />
          </button>
          <button onClick={() => navigate(`/profile/${t.profile.id}`)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-bold">@{t.profile.username}</div>
            <div className="truncate text-xs text-mute">
              You both HIT: {t.sharedPlaces.join(' · ')}
              {t.shared > t.sharedPlaces.length ? ` +${t.shared - t.sharedPlaces.length} more` : ''}
            </div>
          </button>
          <FollowButton followeeId={t.profile.id} />
        </li>
      ))}
    </ul>
  )
}
