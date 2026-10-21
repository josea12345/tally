import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats } from '../lib/types'
import { CATEGORY_GROUPS, dropMedia } from '../lib/types'
import { navigate } from '../App'
import DropGrid from '../components/DropGrid'
import EmptyState from '../components/EmptyState'
import { useFeedVotes } from '../lib/feedVotes'
import MyLists from '../components/MyLists'
import ReminderButton from '../components/ReminderButton'

type Sort = 'recent' | 'oldest' | 'top'
type Status = 'all' | 'totry' | 'tried'

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'top', label: 'Top rated' },
]

export default function Saved({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
  const [triedIds, setTriedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [status, setStatus] = useState<Status>('all')
  // One-tap verdicts from the To Try checklist (the hook wants a stats
  // sink for optimistic counts — Tallies doesn't display counts, so the
  // map is write-only here).
  const { myVotes, setVotesFromRows, vote } = useFeedVotes()
  const [, setStatsSink] = useState<Map<string, DropStats>>(new Map())

  const quickVote = (d: Drop, v: 'W' | 'L') => {
    void vote(d.id, v, setStatsSink, d.author_id)
    // Voting implies tried — the row leaves To Try immediately.
    setTriedIds((s) => new Set(s).add(d.id))
  }

  useEffect(() => {
    if (!user) return
    let live = true
    const load = async () => {
      const { data } = await supabase
        .from('saves')
        .select('drop:drops(*, author:profiles!drops_author_id_fkey(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!live) return
      const list = ((data ?? []) as unknown as Array<{ drop: Drop }>).map((r) => r.drop).filter(Boolean)
      setDrops(list)
      if (list.length > 0) {
        // Which of my tallies have I actually tried? (verdicts.tried)
        const { data: vrows } = await supabase
          .from('verdicts')
          .select('drop_id,tried,verdict,user_id')
          .eq('user_id', user.id)
          .in('drop_id', list.map((d) => d.id))
          .limit(1000)
        if (!live) return
        setVotesFromRows(
          ((vrows ?? []) as Array<{ drop_id: string; verdict: string | null; user_id: string }>).map(
            (v) => ({ drop_id: v.drop_id, verdict: v.verdict, user_id: v.user_id }),
          ),
        )
        setTriedIds(
          new Set(
            ((vrows ?? []) as Array<{ drop_id: string; tried: boolean }>)
              .filter((v) => v.tried)
              .map((v) => v.drop_id)
          )
        )
      }
      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [user])

  const visible = useMemo(() => {
    let list = drops
    if (status === 'totry') list = list.filter((d) => !triedIds.has(d.id))
    else if (status === 'tried') list = list.filter((d) => triedIds.has(d.id))
    if (group !== 'all') {
      const g = CATEGORY_GROUPS.find((x) => x.id === group)
      if (g) list = list.filter((d) => g.categories.includes(d.category))
    }
    if (sort === 'recent') return list
    const sorted = [...list]
    if (sort === 'oldest') sorted.reverse()
    else sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    return sorted
  }, [drops, group, sort, status, triedIds])

  const toTryCount = useMemo(() => drops.filter((d) => !triedIds.has(d.id)).length, [drops, triedIds])

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
      {!bare && <MyLists />}
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
          {/* To try / Tried split — your tallies as a checklist */}
          <div className="px-4 pt-3">
            <div className="flex rounded-full border border-line bg-ink-2 p-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'totry', label: `To try${toTryCount > 0 ? ` · ${toTryCount}` : ''}` },
                  { id: 'tried', label: 'Tried' },
                ] as Array<{ id: Status; label: string }>
              ).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  className={`press flex-1 rounded-full py-1.5 text-xs font-black transition ${
                    status === s.id ? 'bg-sig text-ink' : 'text-mute hover:text-fog'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
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
              {status === 'totry'
                ? 'Nothing waiting. Tally drops from the feed and they queue up here.'
                : status === 'tried'
                  ? "Nothing tried yet — your to-try list is waiting."
                  : 'Nothing here under this filter yet.'}
            </p>
          ) : status === 'totry' ? (
            <ul className="divide-y divide-line">
              {visible.map((d) => {
                const media = dropMedia(d)[0]
                const mine = myVotes.get(d.id)
                return (
                  <li key={d.id} className="flex items-center gap-2 px-4 py-3">
                    <button
                      onClick={() => navigate(`/drop/${d.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {media ? (
                        <img
                          src={media.type === 'video' ? (media.posterUrl ?? media.url) : media.url}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-lg font-black text-mute">
                          {(d.title || '?').slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{d.title}</span>
                        <span className="block truncate text-xs text-mute">
                          @{d.author?.username ?? 'unknown'}
                          {d.city ? ` · ${d.city}` : ''}
                        </span>
                      </span>
                    </button>
                    {d.author_id !== user?.id && (
                      <span className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => quickVote(d, 'W')}
                          aria-label={`Call ${d.title} a W`}
                          className={`press h-10 w-10 rounded-full text-sm font-black ${
                            mine === 'W' ? 'bg-win text-ink' : 'border border-win/60 text-win'
                          }`}
                        >
                          W
                        </button>
                        <button
                          onClick={() => quickVote(d, 'L')}
                          aria-label={`Call ${d.title} an L`}
                          className={`press h-10 w-10 rounded-full text-sm font-black ${
                            mine === 'L' ? 'bg-miss text-white' : 'border border-miss/60 text-miss'
                          }`}
                        >
                          L
                        </button>
                      </span>
                    )}
                    {status === 'totry' && d.author_id !== user?.id && <ReminderButton dropId={d.id} slim />}
                  </li>
                )
              })}
            </ul>
          ) : (
            <DropGrid drops={visible} showScores={sort === 'top'} />
          )}
        </>
      )}
    </div>
  )
}
