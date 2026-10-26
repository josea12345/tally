import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop, DropRating, Profile, Save } from '../lib/types'
import { formatScore } from '../lib/ratings'
import { normKey, timeAgo } from '../lib/format'
import { Avatar, navigate } from '../App'

interface ChainEvent {
  at: string
  kind: 'drop' | 'save' | 'rating' | 'redrop'
  actor: Profile | null
  label: string
  link?: string
}

interface Props {
  drop: Drop
}

/** Provenance thread: drop → bets → ratings → re-drops, time-ordered. */
export default function PutOnChain({ drop }: Props) {
  const [events, setEvents] = useState<ChainEvent[] | null>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      const [savesRes, ratingsRes] = await Promise.all([
        supabase.from('saves').select('*, user:profiles(*)').eq('drop_id', drop.id).order('created_at'),
        supabase.from('drop_ratings').select('*, user:profiles!drop_ratings_user_id_fkey(*)').eq('drop_id', drop.id).order('created_at'),
      ])
      // Re-drops: same normalized title+city by another author, created after this drop.
      const { data: siblings } = await supabase
        .from('drops')
        .select('*, author:profiles!drops_author_id_fkey(*)')
        .neq('id', drop.id)
        .order('created_at')
        .limit(200)

      if (!live) return
      const evts: ChainEvent[] = [
        {
          at: drop.created_at,
          kind: 'drop',
          actor: drop.author ?? null,
          label: `dropped it — “${drop.title}”`,
        },
      ]
      for (const s of (savesRes.data ?? []) as Array<Save & { user: Profile }>) {
        evts.push({ at: s.created_at, kind: 'save', actor: s.user, label: 'wants to try it' })
      }
      for (const v of (ratingsRes.data ?? []) as Array<DropRating & { user: Profile }>) {
        evts.push({
          at: v.updated_at,
          kind: 'rating',
          actor: v.user,
          label: v.score === 10 ? 'peaked it — a 10' : `rated it ${formatScore(v.score)}`,
        })
      }
      const key = normKey(drop.title, drop.city)
      for (const d of (siblings ?? []) as Drop[]) {
        if (d.author_id === drop.author_id) continue
        if (normKey(d.title, d.city) !== key) continue
        if (d.created_at < drop.created_at) continue
        evts.push({
          at: d.created_at,
          kind: 'redrop',
          actor: d.author ?? null,
          label: `put people on again`,
          link: `/drop/${d.id}`,
        })
      }
      evts.sort((a, b) => +new Date(a.at) - +new Date(b.at))
      setEvents(evts)
    }
    load()
    return () => {
      live = false
    }
  }, [drop])

  if (events === null) {
    return <div className="py-4 text-center text-sm text-mute">Loading the chain…</div>
  }
  if (events.length <= 1) {
    return (
      <p className="py-2 text-sm text-mute">
        The chain starts here — hit Try, go try it, and type your score to keep it going.
      </p>
    )
  }

  const dot = (kind: ChainEvent['kind']) =>
    kind === 'rating' ? 'bg-sig' : kind === 'redrop' ? 'bg-fog' : 'bg-line'

  return (
    <ol className="relative ml-2 border-l border-line pl-6">
      {events.map((e, i) => (
        <li key={i} className="rise-in relative pb-5" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ${dot(e.kind)}`} />
          <div className="flex items-center gap-2">
            {e.actor && (
              <button onClick={() => navigate(`/profile/${e.actor!.id}`)}>
                <Avatar url={e.actor.avatar_url} name={e.actor.display_name ?? e.actor.username} size={26} />
              </button>
            )}
            <p className="text-sm">
              {e.actor ? (
                <button onClick={() => navigate(`/profile/${e.actor!.id}`)} className="font-bold hover:text-sig">
                  @{e.actor.username}
                </button>
              ) : (
                <span className="font-bold">Someone</span>
              )}{' '}
              <span className="text-mute">{e.label}</span>{' '}
              <span className="text-xs text-mute">· {timeAgo(e.at)}</span>
              {e.link && (
                <button onClick={() => navigate(e.link!)} className="ml-1 text-xs font-bold text-sig">
                  view drop →
                </button>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
