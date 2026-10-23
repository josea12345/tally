import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Category, Drop, Profile } from '../lib/types'
import { CATEGORY_LABELS, dropMedia } from '../lib/types'
import { Avatar, navigate } from '../App'
import FollowButton from '../components/FollowButton'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'
import { formatAvg } from '../lib/ratings'

type Tab = 'people' | 'drops'

interface DropHit extends Pick<Drop, 'id' | 'title' | 'description' | 'score' | 'created_at' | 'category' | 'media_urls' | 'media_types' | 'media_poster_urls' | 'media_type' | 'media_poster_url' | 'media_url' | 'media_edits'> {
  author: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null
}

export default function Search() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [tab, setTab] = useState<Tab>('people')
  const [catFilter, setCatFilter] = useState<'all' | Category>('all')
  const [people, setPeople] = useState<Profile[]>([])
  const [drops, setDrops] = useState<DropHit[]>([])
  const [fresh, setFresh] = useState<DropHit[]>([])
  const [topics, setTopics] = useState<Array<{ key: string; label: string; count: number }>>([])
  const [topRated, setTopRated] = useState<Array<DropHit & { avg: number; count: number; peaks: number }>>([])
  const [active, setActive] = useState<Array<{ profile: Profile; drops: number }>>([])
  const [suggested, setSuggested] = useState<Array<{ profile: Profile; note: string }>>([])

  // Who to follow: friends-of-follows, most-mutual first.
  useEffect(() => {
    if (!user) {
      setSuggested([])
      return
    }
    let live = true
    ;(async () => {
      const { data: myFollows } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', user.id)
        .limit(500)
      const followees = new Set(
        ((myFollows ?? []) as Array<{ followee_id: string }>).map((f) => f.followee_id),
      )
      if (followees.size === 0) return
      const { data: fof } = await supabase
        .from('follows')
        .select('follower_id, followee_id')
        .in('follower_id', [...followees])
        .limit(1000)
      const tally = new Map<string, { count: number; via: string }>()
      for (const r of (fof ?? []) as Array<{ follower_id: string; followee_id: string }>) {
        if (r.followee_id === user.id || followees.has(r.followee_id)) continue
        const e = tally.get(r.followee_id) ?? { count: 0, via: r.follower_id }
        e.count += 1
        tally.set(r.followee_id, e)
      }
      const top = [...tally.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4)
      if (top.length === 0) return
      const ids = top.map(([id]) => id)
      const viaIds = [...new Set(top.map(([, e]) => e.via))]
      const { data: profs } = await supabase.from('profiles').select('*').in('id', [...ids, ...viaIds])
      if (!live) return
      const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))
      const out: Array<{ profile: Profile; note: string }> = []
      for (const [id, e] of top) {
        const p = byId.get(id)
        const via = byId.get(e.via)
        if (p) out.push({ profile: p, note: via ? `Followed by @${via.username}` : 'Suggested for you' })
      }
      setSuggested(out)
    })()
    return () => {
      live = false
    }
  }, [user?.id])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  // Explore (no query): trending topics, this week's top-rated drops,
  // most active people, then fresh drops — all from real data.
  useEffect(() => {
    if (debounced) return
    let live = true
    const DROP_COLS =
      'id, title, description, score, created_at, media_urls, media_types, media_poster_urls, media_type, media_poster_url, media_url, author:profiles!drops_author_id_fkey(username, display_name, avatar_url)'
    ;(async () => {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
      const [{ data: freshRows }, { data: topicRows }, { data: weekDrops }, { data: authorRows }] =
        await Promise.all([
          supabase.from('drops').select(DROP_COLS).order('created_at', { ascending: false }).limit(15),
          supabase.from('drops').select('topic_key, title').not('topic_key', 'is', null).order('created_at', { ascending: false }).limit(500),
          supabase.from('drops').select(DROP_COLS).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(100),
          supabase.from('drops').select('author_id').limit(1000),
        ])
      if (!live) return
      setFresh((freshRows ?? []) as unknown as DropHit[])

      const byTopic = new Map<string, { label: string; count: number }>()
      for (const r of (topicRows ?? []) as Array<{ topic_key: string; title: string }>) {
        const cur = byTopic.get(r.topic_key)
        if (cur) cur.count++
        else {
          const city = r.topic_key.split('|')[1]
          byTopic.set(r.topic_key, {
            label: city ? `${r.title} · ${city.charAt(0).toUpperCase() + city.slice(1)}` : r.title,
            count: 1,
          })
        }
      }
      setTopics(
        [...byTopic.entries()]
          .map(([key, v]) => ({ key, ...v }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
      )

      const week = (weekDrops ?? []) as unknown as DropHit[]
      if (week.length > 0) {
        const { data: vrows } = await supabase
          .from('drop_ratings')
          .select('drop_id, score')
          .in('drop_id', week.map((d) => d.id))
          .limit(2000)
        if (!live) return
        const rec = new Map<string, { sum: number; count: number; peaks: number }>()
        for (const v of (vrows ?? []) as Array<{ drop_id: string; score: number }>) {
          const e = rec.get(v.drop_id) ?? { sum: 0, count: 0, peaks: 0 }
          e.sum += v.score
          e.count++
          if (v.score === 10) e.peaks++
          rec.set(v.drop_id, e)
        }
        setTopRated(
          week
            .map((d) => {
              const e = rec.get(d.id)
              return { ...d, avg: e ? e.sum / e.count : 0, count: e?.count ?? 0, peaks: e?.peaks ?? 0 }
            })
            .filter((d) => d.count >= 2)
            .sort((a, b) => b.avg - a.avg || b.peaks - a.peaks || b.count - a.count)
            .slice(0, 5),
        )
      }

      const counts = new Map<string, number>()
      for (const r of (authorRows ?? []) as Array<{ author_id: string }>) {
        counts.set(r.author_id, (counts.get(r.author_id) ?? 0) + 1)
      }
      const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      if (topIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('*').in('id', topIds.map(([id]) => id))
        if (!live) return
        const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))
        setActive(
          topIds
            .map(([id, n]) => ({ profile: byId.get(id)!, drops: n }))
            .filter((x) => x.profile),
        )
      }
    })()
    return () => {
      live = false
    }
  }, [debounced])

  useEffect(() => {
    let live = true
    const run = async () => {
      if (!debounced) {
        setPeople([])
        setDrops([])
        return
      }
      setBusy(true)
      const like = `%${debounced.replace(/[%_]/g, '')}%`
      const DROP_COLS =
        'id, title, description, score, created_at, category, media_urls, media_types, media_poster_urls, media_type, media_poster_url, media_url, media_edits, author:profiles!drops_author_id_fkey(username, display_name, avatar_url)'
      // Drops: fuzzy RPC (typo-tolerant, similarity-ranked) for real queries,
      // falling back to the substring match for short queries or RPC errors.
      const searchDropRows = async (): Promise<DropHit[]> => {
        const q = debounced.trim()
        if (q.length >= 3) {
          try {
            const { data: hits, error } = await supabase.rpc('search_drops_fuzzy', { q })
            if (error) throw error
            const ids = ((hits ?? []) as Array<{ id: string }>).map((h) => h.id)
            if (ids.length === 0) return []
            const { data } = await supabase.from('drops').select(DROP_COLS).in('id', ids)
            const byId = new Map(
              ((data ?? []) as unknown as DropHit[]).map((d) => [d.id, d]),
            )
            return ids
              .map((id) => byId.get(id))
              .filter((d): d is DropHit => !!d)
          } catch {
            // fall through to substring search
          }
        }
        const { data } = await supabase
          .from('drops')
          .select(DROP_COLS)
          .or(`title.ilike.${like},description.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(20)
        return (data ?? []) as unknown as DropHit[]
      }
      const [pr, dropRows] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .or(`username.ilike.${like},display_name.ilike.${like}`)
          .limit(20),
        searchDropRows(),
      ])
      if (!live) return
      setPeople(((pr.data ?? []) as Profile[]).filter((p) => p.id !== user?.id))
      setDrops(dropRows)
      setBusy(false)
    }
    run()
    return () => {
      live = false
    }
  }, [debounced, user])

  const presentCats = [...new Set(drops.map((d) => d.category).filter(Boolean))] as Category[]
  const shownDrops = catFilter === 'all' ? drops : drops.filter((d) => d.category === catFilter)

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="mb-3 text-2xl font-black tracking-tight">Search</h1>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCatFilter('all')
          }}
          placeholder="People, places, drops…"
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full rounded-full border border-line bg-ink-2 px-4 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
        />
        {debounced && (
          <div className="mt-3 flex gap-2">
            {(['people', 'drops'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-black capitalize transition ${
                  tab === t ? 'bg-sig text-ink' : 'border border-line text-mute'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {!debounced ? (
        <div className="space-y-7 px-4 pt-4">
          {topics.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Trending topics</h2>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => navigate(`/topic/${encodeURIComponent(t.key)}`)}
                    className="rounded-full border border-line bg-ink-2 px-3.5 py-2 text-sm font-bold transition hover:border-sig/60"
                  >
                    {t.label} <span className="text-sig">· {t.count}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {topRated.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Top rated this week</h2>
              <ul className="space-y-2.5">
                {topRated.map((d) => (
                  <DropRow key={d.id} drop={d} record={`${formatAvg(d.avg)} avg · ${d.count} ratings`} />
                ))}
              </ul>
            </section>
          )}
          {suggested.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Suggested for you</h2>
              <ul className="space-y-3">
                {suggested.map(({ profile, note }) => (
                  <PersonRow key={profile.id} profile={profile} note={note} />
                ))}
              </ul>
            </section>
          )}
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Putting in work</h2>
              <ul className="space-y-3">
                {active.map(({ profile, drops }) => (
                  <PersonRow key={profile.id} profile={profile} note={`${drops} drop${drops === 1 ? '' : 's'}`} />
                ))}
              </ul>
            </section>
          )}
          <button
            onClick={() => navigate('/leaderboard')}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-ink-2 p-4 text-left transition hover:border-sig/50"
          >
            <span>
              <span className="block text-sm font-black">Miami leaderboard</span>
              <span className="block text-xs text-mute">This week's tastemakers, ranked by Taste Score</span>
            </span>
            <span className="text-lg font-black text-sig">→</span>
          </button>
          <section>
            <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Fresh drops</h2>
            {fresh.length === 0 ? (
              <p className="text-sm text-mute">Nothing dropped yet — be the first.</p>
            ) : (
              <ul className="space-y-2.5">
                {fresh.map((d) => (
                  <DropRow key={d.id} drop={d} />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : busy ? (
        <div className="animate-pulse space-y-3 px-4 py-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-ink-3" />
          ))}
        </div>
      ) : tab === 'people' ? (
        <div className="px-4 pt-4">
          {people.length === 0 ? (
            <EmptyState title="No people found" body={`Nobody matches "${debounced}" yet.`} />
          ) : (
            <ul className="space-y-3">
              {people.map((p) => (
                <PersonRow key={p.id} profile={p} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="px-4 pt-4">
          {drops.length === 0 ? (
            <EmptyState title="No drops found" body={`Nothing matches "${debounced}" yet.`} />
          ) : (
            <>
              {presentCats.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setCatFilter('all')}
                    className={`rounded-full px-3 py-1 text-[11px] font-black transition ${
                      catFilter === 'all' ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
                    }`}
                  >
                    All
                  </button>
                  {presentCats.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCatFilter(c)}
                      className={`rounded-full px-3 py-1 text-[11px] font-black transition ${
                        catFilter === c ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
                      }`}
                    >
                      {CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              )}
              {shownDrops.length === 0 ? (
                <p className="py-6 text-center text-sm text-mute">Nothing in that category for "{debounced}".</p>
              ) : (
                <ul className="space-y-2.5">
                  {shownDrops.map((d) => (
                    <DropRow key={d.id} drop={d} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PersonRow({ profile: p, note }: { profile: Profile; note?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 p-3">
      <button onClick={() => navigate(`/profile/${p.id}`)}>
        <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={44} />
      </button>
      <button onClick={() => navigate(`/profile/${p.id}`)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-bold">
          {p.display_name || `@${p.username}`}{' '}
          <span className="font-normal text-mute">@{p.username}</span>
        </div>
        {(note || p.bio) && <div className="truncate text-xs text-mute">{note ?? p.bio}</div>}
      </button>
      <FollowButton followeeId={p.id} />
    </li>
  )
}

function DropRow({ drop: d, record }: { drop: DropHit; record?: string }) {
  const first = dropMedia(d)[0]
  const thumb = first ? (first.type === 'video' ? first.posterUrl || undefined : first.url) : undefined
  return (
    <li>
      <button
        onClick={() => navigate(`/drop/${d.id}`)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-ink-2 p-2.5 text-left transition hover:border-sig/50"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-black object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-lg">📍</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{d.title}</span>
          <span className="block truncate text-xs text-mute">
            @{d.author?.username ?? '?'} · {timeAgo(d.created_at)}
            {d.score != null && <span className="font-bold text-sig"> · {d.score}/10</span>}
            {record && <span className="font-bold text-win"> · {record}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}
