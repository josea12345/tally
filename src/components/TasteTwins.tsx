import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop, Profile, Verdict } from '../lib/types'
import { tasteTwins, type TasteTwin } from '../lib/stats'
import { Avatar, navigate } from '../App'
import FollowButton from './FollowButton'

/** People who took the W on what you took the W on — a discovery graph from verdicts. */
export default function TasteTwins({ myId }: { myId: string }) {
  const [twins, setTwins] = useState<TasteTwin[] | null>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      // Step 1: my own W verdicts (user-scoped, exact). Everything else is
      // derived from these drop ids — no global verdicts scan.
      const { data: myWinRows } = await supabase
        .from('verdicts')
        .select('drop_id')
        .eq('user_id', myId)
        .eq('verdict', 'W')
      if (!live) return
      const myWins = new Set(((myWinRows ?? []) as Array<{ drop_id: string }>).map((v) => v.drop_id))
      if (myWins.size === 0) {
        setTwins([])
        return
      }
      const winIds = [...myWins]
      // Step 2: everyone else's W verdicts on exactly those drops, plus the
      // drop titles — scoped and exact, no row limit.
      const [{ data: otherWins }, { data: dropRows }] = await Promise.all([
        supabase.from('verdicts').select('user_id,drop_id').eq('verdict', 'W').neq('user_id', myId).in('drop_id', winIds),
        supabase.from('drops').select('id,title').in('id', winIds),
      ])
      if (!live) return
      // Step 3: only the profiles that actually share a W with me.
      const voterIds = [...new Set(((otherWins ?? []) as Array<{ user_id: string }>).map((v) => v.user_id))]
      const { data: profRows } = voterIds.length > 0
        ? await supabase.from('profiles').select('*').in('id', voterIds)
        : { data: [] as Profile[] }
      if (!live) return
      const vs = (otherWins ?? []) as Verdict[]
      const dropById = new Map(((dropRows ?? []) as Drop[]).map((d) => [d.id, d]))
      const profById = new Map(((profRows ?? []) as Profile[]).map((p) => [p.id, p]))
      setTwins(tasteTwins(myId, myWins, vs, dropById, profById))
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
        Call W on a few drops and your taste twins will show up here.
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
              You both took the W: {t.sharedPlaces.join(' · ')}
              {t.shared > t.sharedPlaces.length ? ` +${t.shared - t.sharedPlaces.length} more` : ''}
            </div>
          </button>
          <FollowButton followeeId={t.profile.id} />
        </li>
      ))}
    </ul>
  )
}
