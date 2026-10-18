import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile, Verdict } from '../lib/types'
import { winRateFor } from '../lib/stats'
import { Avatar, navigate } from '../App'
import FollowButton from '../components/FollowButton'
import TasteTwins from '../components/TasteTwins'
import LeaderboardRail from '../components/LeaderboardRail'
import EmptyState from '../components/EmptyState'

interface RatedProfile extends Profile {
  rate: number | null
  total: number
}

export default function People() {
  const { user, profile } = useAuth()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [whoToFollow, setWhoToFollow] = useState<RatedProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  // People search
  useEffect(() => {
    let live = true
    const run = async () => {
      if (!debounced) {
        setResults([])
        return
      }
      const like = `%${debounced.replace(/[%_]/g, '')}%`
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .limit(20)
      if (live) setResults(((data ?? []) as Profile[]).filter((p) => p.id !== user?.id))
    }
    run()
    return () => {
      live = false
    }
  }, [debounced, user])

  // Who to follow: ranked by proven taste (win rate, min 5 verdicts), excluding self + already followed.
  useEffect(() => {
    let live = true
    const load = async () => {
      setLoading(true)
      const [{ data: profiles }, { data: verdicts }, { data: drops }, { data: follows }] = await Promise.all([
        supabase.from('profiles').select('*').limit(200),
        supabase.from('verdicts').select('verdict, drop:drops!inner(author_id)').limit(4000),
        supabase.from('drops').select('id').limit(1),
        user ? supabase.from('follows').select('followee_id').eq('follower_id', user.id).limit(2000) : Promise.resolve({ data: [] as Array<{ followee_id: string }> }),
      ])
      void drops
      if (!live) return
      const perAuthor = new Map<string, Verdict[]>()
      for (const v of (verdicts ?? []) as Array<Verdict & { drop: { author_id: string } }>) {
        const a = v.drop.author_id
        if (!perAuthor.has(a)) perAuthor.set(a, [])
        perAuthor.get(a)!.push(v)
      }
      const followed = new Set(((follows?.data ?? []) as Array<{ followee_id: string }>).map((f) => f.followee_id))
      const rated: RatedProfile[] = []
      for (const p of (profiles ?? []) as Profile[]) {
        if (p.id === user?.id || followed.has(p.id)) continue
        const hr = winRateFor(perAuthor.get(p.id) ?? [])
        if (hr.rate == null) continue
        rated.push({ ...p, rate: hr.rate, total: hr.total })
      }
      rated.sort((a, b) => b.rate! - a.rate! || b.total - a.total)
      setWhoToFollow(rated.slice(0, 10))
      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [user])

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="mb-3 text-2xl font-black tracking-tight">People</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people by name or @handle…"
          className="w-full rounded-full border border-line bg-ink-2 px-4 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
        />
      </div>

      {debounced ? (
        <div className="px-4 pt-4">
          {results.length === 0 ? (
            <EmptyState title="No people found" body={`Nobody matches "${debounced}" yet.`} />
          ) : (
            <ul className="space-y-3">
              {results.map((p) => (
                <PersonRow key={p.id} profile={p} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-6 px-4 pt-5">
          <section>
            <h2 className="mb-1 text-sm font-black uppercase tracking-widest text-mute">Who to follow</h2>
            <p className="mb-3 text-xs text-mute">Ranked by proven taste — win rate over 5+ verdicts.</p>
            {loading ? (
              <p className="text-sm text-mute">Loading…</p>
            ) : whoToFollow.length === 0 ? (
              <p className="text-sm text-mute">
                Nobody's earned a rate yet — verdicts from real visits build this list.
              </p>
            ) : (
              <ul className="space-y-3">
                {whoToFollow.map((p) => (
                  <PersonRow key={p.id} profile={p} rate={p.rate} total={p.total} />
                ))}
              </ul>
            )}
          </section>

          {user && (
            <section>
              <h2 className="mb-1 text-sm font-black uppercase tracking-widest text-mute">Taste twins</h2>
              <p className="mb-3 text-xs text-mute">People who take the W on what you take the W on.</p>
              <TasteTwins myId={user.id} />
            </section>
          )}

          <section>
            <LeaderboardRail city={profile?.city ?? 'Miami'} />
          </section>
        </div>
      )}
    </div>
  )
}

function PersonRow({ profile: p, rate, total }: { profile: Profile; rate?: number | null; total?: number }) {
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
        {p.bio && <div className="truncate text-xs text-mute">{p.bio}</div>}
        {rate != null && (
          <div className="text-xs font-bold text-lime">
            {Math.round(rate * 100)}% win rate · {total} verdicts
          </div>
        )}
      </button>
      <FollowButton followeeId={p.id} />
    </li>
  )
}
