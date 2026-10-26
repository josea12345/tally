import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats } from '../lib/types'
import { CATEGORY_GROUPS, dropMedia } from '../lib/types'
import { navigate } from '../App'
import DropGrid from '../components/DropGrid'
import EmptyState from '../components/EmptyState'
import { useRatings } from '../lib/useRatings'
import RateSheet from '../components/RateSheet'
import { PeakMark } from '../components/PeakWordmark'
import { formatScore } from '../lib/ratings'
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
  // Tries and Lists are separate sections on this page (Jose's call,
  // 2026-10-26) — a toggle, not one mixed scroll. Bare mode (profile
  // Try tab) is tries-only, as profiles have their own Lists tab.
  const [section, setSection] = useState<'tries' | 'lists'>('tries')
  // Rating from the To Try checklist (the hook wants a stats sink for
  // optimistic counts — Bets doesn't display counts, so the map is
  // write-only here). Rating a bet = you tried it: the row moves to Tried.
  const { myRatings, myChanges, setRatingsFromRows, rate, unrate } = useRatings()
  const [, setStatsSink] = useState<Map<string, DropStats>>(new Map())
  const [rateTarget, setRateTarget] = useState<Drop | null>(null)

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
        // Which of my bets have I actually tried? The ones I've rated.
        const { data: rrows } = await supabase
          .from('drop_ratings_with_budget')
          .select('drop_id,score,user_id,change_spent')
          .eq('user_id', user.id)
          .in('drop_id', list.map((d) => d.id))
          .limit(1000)
        if (!live) return
        const rows = (rrows ?? []) as Array<{ drop_id: string; score: number; user_id: string }>
        setRatingsFromRows(rows)
        setTriedIds(new Set(rows.map((r) => r.drop_id)))
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
          {/* Section tabs styled on the feed tab bar, scaled up
              (Jose's reference, 2026-10-26): Try pinned left, Lists
              pinned right; active is black + the blue underline. */}
          <div className="flex items-center justify-center gap-12">
            {(
              [
                { id: 'tries', label: 'Try' },
                { id: 'lists', label: 'Lists' },
              ] as Array<{ id: 'tries' | 'lists'; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setSection(t.id)}
                className={`relative whitespace-nowrap px-1 py-1 text-[26px] transition ${
                  section === t.id ? 'font-black text-fog' : 'font-bold text-mute hover:text-fog'
                }`}
              >
                {t.label}
                {section === t.id && (
                  <span className="absolute -bottom-[5px] left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-sig" />
                )}
              </button>
            ))}
          </div>
          <p className="pt-2 text-center text-sm text-mute">
            {section === 'tries'
              ? 'Everything people put you on to.'
              : 'The stacks you put together.'}
          </p>
        </div>
      )}
      {!bare && section === 'lists' ? (
        <MyLists />
      ) : drops.length === 0 ? (
        <EmptyState
          title="Nothing in the vault yet"
          body="When someone puts you on to something, tap Try and it queues up here — your shortlist of things worth trying."
          mood="happy"
          action={
            <button onClick={() => navigate('/')} className="btn-pop press px-6 py-2.5 text-sm">
              Find a put-on
            </button>
          }
        />
      ) : (
        <>
          {/* To try / Tried split — your bets as a checklist */}
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
                ? 'Nothing waiting. Hit Try on drops from the feed and they queue up here.'
                : status === 'tried'
                  ? "Nothing tried yet — rate one once you've tried it and it lands here."
                  : 'Nothing here under this filter yet.'}
            </p>
          ) : status === 'totry' ? (
            <ul className="divide-y divide-line">
              {visible.map((d) => {
                const media = dropMedia(d)[0]
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
                      <button
                        onClick={() => setRateTarget(d)}
                        aria-label={`Rate ${d.title}`}
                        className="press flex shrink-0 items-center gap-1.5 rounded-full border border-sig/60 px-4 py-2.5 text-sm font-black text-sig"
                      >
                        <PeakMark className="h-3.5 w-auto" />
                        {myRatings.get(d.id) != null ? formatScore(myRatings.get(d.id)!) : 'Rate it'}
                      </button>
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
      {rateTarget && (
        <RateSheet
          title={rateTarget.title}
          current={myRatings.get(rateTarget.id) ?? null}
          locked={myChanges.get(rateTarget.id) ?? false}
          onRate={(score) => {
            void rate(rateTarget.id, score, setStatsSink)
            setTriedIds((s) => new Set(s).add(rateTarget.id))
          }}
          onRemove={() => {
            void unrate(rateTarget.id, setStatsSink)
            setTriedIds((s) => {
              const n = new Set(s)
              n.delete(rateTarget.id)
              return n
            })
          }}
          onClose={() => setRateTarget(null)}
        />
      )}
    </div>
  )
}
