import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useFeedVotes } from '../lib/feedVotes'
import type { Category, Drop, DropStats, Profile, Verdict } from '../lib/types'
import { MEDIA_CATEGORIES, isPlaceCategory } from '../lib/types'
import { winRateFor } from '../lib/stats'
import { haversineKm } from '../lib/geo'
import { useDeviceLocation } from '../hooks/useLocation'
import { Avatar, navigate } from '../App'
import { useUnreadCount } from '../lib/useNotifications'
import DropCard from '../components/DropCard'
import CategoryTabs from '../components/CategoryTabs'
import LocationStrip from '../components/LocationStrip'
import EmptyState from '../components/EmptyState'

type Tab = 'putons' | 'following' | 'near'

const NEAR_MILES = 25

function AlertsBell() {
  const unread = useUnreadCount()
  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label="Notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line text-xl transition hover:border-lime"
    >
      🔔
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

export default function Discover() {
  const { user, profile } = useAuth()
  const { myVotes, setVotesFromRows, vote } = useFeedVotes()
  const [tab, setTab] = useState<Tab>('putons')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [drops, setDrops] = useState<Drop[]>([])
  const [stats, setStats] = useState<Map<string, DropStats>>(new Map())
  const [mySaves, setMySaves] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [tastemakers, setTastemakers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { state: locState, effective, locate, useCity } = useDeviceLocation(profile?.city)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    let live = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        let q = supabase
          .from('drops')
          .select('*, author:profiles(*)')
          .order('created_at', { ascending: false })
          .limit(150)
        if (category !== 'all') q = q.eq('category', category)
        if (debounced) {
          const like = `%${debounced.replace(/[%_]/g, '')}%`
          q = q.or(`title.ilike.${like},description.ilike.${like},city.ilike.${like},neighborhood.ilike.${like}`)
        }
        const { data: dropRows, error: dErr } = await q
        if (dErr) throw dErr
        const list = (dropRows ?? []) as Drop[]
        if (!live) return
        setDrops(list)

        const ids = list.map((d) => d.id)
        if (ids.length > 0) {
          const [{ data: saves }, { data: verdicts }, { data: cmts }] = await Promise.all([
            supabase.from('saves').select('drop_id').in('drop_id', ids).limit(5000),
            supabase.from('verdicts').select('drop_id,verdict,user_id').in('drop_id', ids).limit(5000),
            supabase.from('comments').select('drop_id').in('drop_id', ids).limit(5000),
          ])
          if (!live) return
          const m = new Map<string, DropStats>()
          for (const id of ids) m.set(id, { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 })
          for (const s of (saves ?? []) as Array<{ drop_id: string }>) m.get(s.drop_id)!.saves++
          for (const v of (verdicts ?? []) as Array<{ drop_id: string; verdict: string | null; tried?: boolean }>) {
            const e = m.get(v.drop_id)!
            if (v.verdict === 'W') e.wins++
            else if (v.verdict === 'L') e.losses++
          }
          for (const c of (cmts ?? []) as Array<{ drop_id: string }>) m.get(c.drop_id)!.comments++
          setStats(m)
          setVotesFromRows((verdicts ?? []) as Array<{ drop_id: string; verdict: string | null; user_id: string }>)
        } else {
          setStats(new Map())
        }

        if (user) {
          const [{ data: mine }, { data: follows }] = await Promise.all([
            supabase.from('saves').select('drop_id').eq('user_id', user.id).limit(2000),
            supabase.from('follows').select('followee_id').eq('follower_id', user.id).limit(2000),
          ])
          if (!live) return
          setMySaves(new Set(((mine ?? []) as Array<{ drop_id: string }>).map((s) => s.drop_id)))
          setFollowing(new Set(((follows ?? []) as Array<{ followee_id: string }>).map((f) => f.followee_id)))
        }

        // Tastemaker rail: authors with a real win rate, top 10.
        const { data: allVerdicts } = await supabase
          .from('verdicts')
          .select('verdict, drop:drops!inner(author_id)')
          .limit(3000)
        if (!live) return
        const perAuthor = new Map<string, Verdict[]>()
        for (const v of (allVerdicts ?? []) as Array<Verdict & { drop: { author_id: string } }>) {
          const a = v.drop.author_id
          if (!perAuthor.has(a)) perAuthor.set(a, [])
          perAuthor.get(a)!.push(v)
        }
        const rated = [...perAuthor.entries()]
          .map(([authorId, vs]) => ({ authorId, hr: winRateFor(vs) }))
          .filter((x) => x.hr.rate != null)
          .sort((a, b) => b.hr.rate! - a.hr.rate! || b.hr.total - a.hr.total)
          .slice(0, 10)
        if (rated.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('*')
            .in('id', rated.map((r) => r.authorId))
          if (!live) return
          const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))
          setTastemakers(rated.map((r) => byId.get(r.authorId)).filter((p): p is Profile => !!p))
        } else {
          setTastemakers([])
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load drops.')
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => {
      live = false
    }
  }, [category, debounced, user])

  const visible = useMemo(() => {
    let list = drops
    if (tab === 'following') list = list.filter((d) => following.has(d.author_id))
    if (tab === 'near') {
      list = list.filter((d) => {
        if (MEDIA_CATEGORIES.includes(d.category)) return true
        if (!isPlaceCategory(d.category)) return true
        if (d.latitude == null || d.longitude == null) return true // unpinned places stay visible
        const km = haversineKm(effective, { lat: d.latitude, lon: d.longitude })
        return km * 0.621371 <= NEAR_MILES
      })
    }
    return list
  }, [drops, tab, following, effective])

  const toggleSave = async (dropId: string) => {
    if (!user) {
      navigate('/auth')
      return
    }
    const saved = mySaves.has(dropId)
    // optimistic
    setMySaves((prev) => {
      const n = new Set(prev)
      if (saved) n.delete(dropId)
      else n.add(dropId)
      return n
    })
    setStats((prev) => {
      const n = new Map(prev)
      const e = n.get(dropId)
      if (e) n.set(dropId, { ...e, saves: e.saves + (saved ? -1 : 1) })
      return n
    })
    try {
      if (saved) {
        await supabase.from('saves').delete().eq('user_id', user.id).eq('drop_id', dropId)
      } else {
        await supabase.from('saves').insert({ user_id: user.id, drop_id: dropId })
      }
    } catch {
      /* revert on failure */
      setMySaves((prev) => {
        const n = new Set(prev)
        if (saved) n.add(dropId)
        else n.delete(dropId)
        return n
      })
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'putons', label: 'Put Ons' },
    { id: 'following', label: 'Following' },
    { id: 'near', label: 'Near me' },
  ]

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-line bg-ink/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-xl font-bold tracking-tight">
            TALLY<span className="text-lime">.</span>
          </div>
          <AlertsBell />
        </div>
        <div className="mb-3 flex gap-1 rounded-full bg-ink-3 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full py-2 text-sm font-black transition ${
                tab === t.id ? 'bg-lime text-ink' : 'text-mute hover:text-fog'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-[11px] leading-snug text-mute">
          Food & drink and shops narrow to near you — movies, TV and music travel everywhere.
        </p>
        <div className="mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a put-on…"
            className="w-full rounded-full border border-line bg-ink-2 px-4 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
          />
        </div>
        <CategoryTabs value={category} onChange={setCategory} />
        {locState.status !== 'on' && (
          <div className="mt-3">
            <LocationStrip
              state={locState}
              effectiveLabel={effective.label}
              fromGps={effective.source === 'gps'}
              profileCity={profile?.city}
              onLocate={locate}
              onUseCity={useCity}
            />
          </div>
        )}
      </div>

      {tastemakers.length > 0 && tab === 'putons' && (
        <div className="border-b border-line px-4 py-3">
          <div className="mb-2 text-xs font-black uppercase tracking-widest text-mute">Proven taste</div>
          <div className="rail-scroll flex gap-4 overflow-x-auto pb-1">
            {tastemakers.map((p) => (
              <button key={p.id} onClick={() => navigate(`/profile/${p.id}`)} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <span className="rounded-full p-[2px]" style={{ boxShadow: '0 0 0 2px #0a0a0b, 0 0 0 4px #c8f31d' }}>
                  <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={52} />
                </span>
                <span className="w-full truncate text-center text-[10px] font-bold">@{p.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse border-b border-line px-4 py-4">
              <div className="flex gap-3">
                <div className="h-11 w-11 rounded-full bg-ink-3" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-ink-3" />
                  <div className="h-4 w-full rounded bg-ink-3" />
                  <div className="h-4 w-2/3 rounded bg-ink-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load drops" body={error} action={
          <button onClick={() => window.location.reload()} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
            Try again
          </button>
        } />
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            debounced
              ? 'No put-ons match that search'
              : tab === 'following'
                ? "Nobody's put you on to anything yet"
                : tab === 'near'
                  ? 'Nothing near you yet'
                  : "Nobody's put you on to this one yet"
          }
          body={
            debounced
              ? 'Try a different search — or be the first to drop it.'
              : tab === 'following'
                ? 'Follow people with proven taste and their drops will land here.'
                : tab === 'near'
                  ? 'Drops near your location will show up here. For everything, check Put Ons.'
                  : 'Be the first — drop something worth knowing.'
          }
          action={
            <button onClick={() => navigate('/create')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
              Put someone on
            </button>
          }
        />
      ) : (
        visible.map((d, i) => (
          <DropCard
            key={d.id}
            drop={d}
            stats={stats.get(d.id) ?? { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 }}
            saved={mySaves.has(d.id)}
            onToggleSave={() => toggleSave(d.id)}
            myVote={myVotes.get(d.id) ?? null}
            onVote={(v) => vote(d.id, v, setStats, d.author_id)}
            revealDelay={(i % 6) * 70}
          />
        ))
      )}
    </div>
  )
}
