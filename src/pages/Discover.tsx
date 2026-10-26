import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useRatings } from '../lib/useRatings'
import type { Category, Drop, DropStats, Profile } from '../lib/types'
import { MEDIA_CATEGORIES, CATEGORY_GROUPS, isPlaceCategory } from '../lib/types'
import { ratingSummaryFor } from '../lib/stats'
import RateSheet from '../components/RateSheet'
import { formatAvg } from '../lib/ratings'
import { haversineKm } from '../lib/geo'
import { useDeviceLocation } from '../hooks/useLocation'
import { tapHaptic } from '../lib/haptics'
import { Avatar, navigate } from '../App'
import { useUnreadCount } from '../lib/useNotifications'
import AlertIcon from '../components/AlertIcon'
import DropCard from '../components/DropCard'
import DropMap from '../components/DropMap'
import CategoryTabs from '../components/CategoryTabs'
import LocationStrip from '../components/LocationStrip'
import OnboardingChecklist from '../components/OnboardingChecklist'
import FollowingSuggestions from '../components/FollowingSuggestions'
import ListsFeed from '../components/ListsFeed'
import ContestedRail from '../components/ContestedRail'
import RequestsStrip from '../components/RequestsStrip'
import EmptyState from '../components/EmptyState'

type Tab = 'putons' | 'following' | 'near' | 'lists'

const NEAR_MILES = 25

function AlertsBell() {
  const unread = useUnreadCount()
  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label="Notifications"
      className="relative flex h-9 w-9 items-center justify-center text-fog transition hover:text-sig"
    >
      <AlertIcon className="h-6 w-6" />
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

export default function Discover() {
  const { user, profile } = useAuth()
  const { myRatings, myChanges, setRatingsFromRows, mergeRatingsFromRows, rate, unrate } = useRatings()
  const [rateTarget, setRateTarget] = useState<{ drop: Drop; prefill: number | null } | null>(null)
  const [tab, setTab] = useState<Tab>('putons')
  const [nearView, setNearView] = useState<'list' | 'map'>('list')
  const [group, setGroup] = useState<string>('all')
  const [sub, setSub] = useState<Category | 'all'>('all')
  const pickGroup = (id: string) => {
    setGroup(id)
    setSub('all')
  }
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
    else setQuery('')
  }, [searchOpen])
  const [drops, setDrops] = useState<Drop[]>([])
  const [stats, setStats] = useState<Map<string, DropStats>>(new Map())
  const [topicCounts, setTopicCounts] = useState<Map<string, number>>(new Map())
  const [mySaves, setMySaves] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [topicDrops, setTopicDrops] = useState<Drop[]>([])
  const [yday, setYday] = useState<{ drop: Drop; avg: number; count: number; peaks: number } | null>(null)

  // Yesterday's top call: the drop with yesterday's best rating record.
  useEffect(() => {
    let live = true
    ;(async () => {
      const now = new Date()
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startYday = new Date(startToday)
      startYday.setDate(startYday.getDate() - 1)
      const { data: rows } = await supabase
        .from('drop_ratings')
        .select('score, drop_id')
        .gte('created_at', startYday.toISOString())
        .lt('created_at', startToday.toISOString())
        .limit(2000)
      if (!live) return
      const agg = new Map<string, number[]>()
      for (const r of (rows ?? []) as Array<{ score: number; drop_id: string }>) {
        const arr = agg.get(r.drop_id) ?? []
        arr.push(r.score)
        agg.set(r.drop_id, arr)
      }
      const scored = [...agg.entries()]
        .filter(([, scores]) => scores.length >= 2)
        .map(([id, scores]) => ({
          id,
          avg: scores.reduce((a, b) => a + b, 0) / scores.length,
          count: scores.length,
          peaks: scores.filter((x) => x === 10).length,
        }))
        .sort((a, b) => b.avg - a.avg || b.peaks - a.peaks || b.count - a.count)
      const best = scored[0]
      if (!best) return
      const { data: d } = await supabase
        .from('drops')
        .select('*, author:profiles!drops_author_id_fkey(*)')
        .eq('id', best.id)
        .maybeSingle()
      if (!live || !d) return
      setYday({ drop: d as Drop, avg: best.avg, count: best.count, peaks: best.peaks })
    })()
    return () => {
      live = false
    }
  }, [])
  const [tastemakers, setTastemakers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Pull-to-refresh: bumping the nonce re-runs the feed load with a spinner
  // instead of the skeleton flash.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [pull, setPull] = useState(0)
  const pullStartY = useRef<number | null>(null)
  // Pagination: pages of PAGE_SIZE replace the old hard 150 cap.
  const PAGE_SIZE = 40
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const genRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { state: locState, effective, locate, useCity } = useDeviceLocation(profile?.city)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  /** The drops query for the current filters (shared by page 0 + load-more). */
  const buildDropsQuery = () => {
    let q = supabase
      .from('drops')
      .select('*, author:profiles!drops_author_id_fkey(*)')
      .order('created_at', { ascending: false })
    if (sub !== 'all') q = q.eq('category', sub)
    else if (group !== 'all') {
      const g = CATEGORY_GROUPS.find((x) => x.id === group)
      if (g) q = q.in('category', g.categories)
    }
    if (debounced) {
      const like = `%${debounced.replace(/[%_]/g, '')}%`
      q = q.or(`title.ilike.${like},description.ilike.${like},city.ilike.${like},neighborhood.ilike.${like}`)
    }
    return q
  }

  /** Stats + topic counts for one page of drops. */
  const fetchStatsFor = async (list: Drop[]) => {
    const ids = list.map((d) => d.id)
    const tkeys = [...new Set(list.map((d) => d.topic_key).filter(Boolean))] as string[]
    const [{ data: saves }, { data: ratings }, { data: cmts }, { data: trows }] = await Promise.all([
      supabase.from('saves').select('drop_id').in('drop_id', ids).limit(5000),
      supabase.from('drop_ratings_with_budget').select('drop_id,score,user_id,change_spent').in('drop_id', ids).limit(5000),
      supabase.from('comments').select('drop_id').in('drop_id', ids).limit(5000),
      // one lightweight query for every visible topic's post count
      // (RLS hides blocked/private drops, so counts stay honest)
      tkeys.length > 0
        ? supabase.from('drops').select('topic_key').in('topic_key', tkeys).limit(5000)
        : Promise.resolve({ data: [] as Array<{ topic_key: string }> }),
    ])
    const tc = new Map<string, number>()
    for (const r of (trows ?? []) as Array<{ topic_key: string }>) {
      tc.set(r.topic_key, (tc.get(r.topic_key) ?? 0) + 1)
    }
    const m = new Map<string, DropStats>()
    for (const id of ids) m.set(id, { saves: 0, comments: 0, ratingAvg: null, ratingCount: 0, peaks: 0 })
    for (const s of (saves ?? []) as Array<{ drop_id: string }>) m.get(s.drop_id)!.saves++
    const sums = new Map<string, number>()
    for (const v of (ratings ?? []) as Array<{ drop_id: string; score: number }>) {
      const e = m.get(v.drop_id)!
      e.ratingCount++
      if (v.score === 10) e.peaks++
      sums.set(v.drop_id, (sums.get(v.drop_id) ?? 0) + v.score)
    }
    for (const [id, sum] of sums) {
      const e = m.get(id)!
      e.ratingAvg = sum / e.ratingCount
    }
    for (const c of (cmts ?? []) as Array<{ drop_id: string }>) m.get(c.drop_id)!.comments++
    return {
      m,
      tc,
      ratingRows: (ratings ?? []) as Array<{ drop_id: string; score: number; user_id: string }>,
    }
  }

  useEffect(() => {
    let live = true
    genRef.current++
    const load = async () => {
      // First load gets skeletons; later loads (filters, pull-to-refresh)
      // keep the current content and just spin the refresh pill.
      if (refreshNonce === 0) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const { data: dropRows, error: dErr } = await buildDropsQuery().range(0, PAGE_SIZE - 1)
        if (dErr) throw dErr
        const list = (dropRows ?? []) as Drop[]
        if (!live) return
        setDrops(list)
        setHasMore(list.length === PAGE_SIZE)

        if (list.length > 0) {
          const { m, tc, ratingRows } = await fetchStatsFor(list)
          if (!live) return
          setTopicCounts(tc)
          setStats(m)
          setRatingsFromRows(ratingRows)
        } else {
          setStats(new Map())
          setTopicCounts(new Map())
        }

        let followingIds = new Set<string>()
        if (user) {
          const [{ data: mine }, { data: follows }] = await Promise.all([
            supabase.from('saves').select('drop_id').eq('user_id', user.id).limit(2000),
            supabase.from('follows').select('followee_id').eq('follower_id', user.id).limit(2000),
          ])
          if (!live) return
          setMySaves(new Set(((mine ?? []) as Array<{ drop_id: string }>).map((s) => s.drop_id)))
          followingIds = new Set(((follows ?? []) as Array<{ followee_id: string }>).map((f) => f.followee_id))
          setFollowing(followingIds)

          // Topics I follow: their recent drops join the Following tab.
          const { data: tFollows } = await supabase
            .from('topic_follows')
            .select('topic_key')
            .eq('user_id', user.id)
            .limit(200)
          const keys = ((tFollows ?? []) as Array<{ topic_key: string }>).map((t) => t.topic_key)
          if (!live) return
          if (keys.length > 0) {
            const { data: tDrops } = await supabase
              .from('drops')
              .select('*, author:profiles!drops_author_id_fkey(*)')
              .in('topic_key', keys)
              .order('created_at', { ascending: false })
              .limit(40)
            const tList = (tDrops ?? []) as Drop[]
            if (!live) return
            setTopicDrops(tList)
            if (tList.length > 0) {
              const extra = await fetchStatsFor(tList)
              if (!live) return
              setStats((prev) => new Map([...prev, ...extra.m]))
              setTopicCounts((prev) => new Map([...prev, ...extra.tc]))
              mergeRatingsFromRows(extra.ratingRows)
            }
          }
        }

        // Tastemaker rail: authors with a real rating record, top 10.
        //
        // Scoped EXPLICITLY to ratings from the last 90 days. An exact
        // all-time per-author average can't be computed client-side past
        // table scale (it would need every rating row ever), so the rail
        // ranks on a fixed recent window instead of pretending to cover all
        // time.
        const railSince = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
        const { data: railRatings } = await supabase
          .from('drop_ratings')
          .select('score, drop:drops!inner(author_id)')
          .gte('created_at', railSince)
        if (!live) return
        const perAuthor = new Map<string, number[]>()
        for (const v of (railRatings ?? []) as unknown as Array<{ score: number; drop: { author_id: string } }>) {
          const a = v.drop.author_id
          if (!perAuthor.has(a)) perAuthor.set(a, [])
          perAuthor.get(a)!.push(v.score)
        }
        const rated = [...perAuthor.entries()]
          .map(([authorId, scores]) => ({ authorId, hr: ratingSummaryFor(scores) }))
          .filter((x) => x.hr.enough)
          // Ranked by Taste Score (the same credibility-weighted average
          // profiles show), not the raw mean — a couple of friendly 10s
          // can't outrank a proven record with real volume.
          .sort((a, b) => b.hr.score - a.hr.score || b.hr.count - a.hr.count)
          .slice(0, 10)
        if (rated.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('*')
            .in('id', rated.map((r) => r.authorId))
          if (!live) return
          const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))
          // Private authors stay out of the public rail unless you follow them (or it's you).
          setTastemakers(
            rated
              .map((r) => byId.get(r.authorId))
              .filter((p): p is Profile => !!p)
              .filter((p) => !p.is_private || p.id === user?.id || followingIds.has(p.id))
          )
        } else {
          setTastemakers([])
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load drops.')
      } finally {
        if (live) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    load()
    return () => {
      live = false
    }
  }, [group, sub, debounced, user, refreshNonce])

  /** Append the next page of drops (deduped) with its stats merged in. */
  const loadMore = async () => {
    if (loadingMore || !hasMore || loading) return
    const gen = genRef.current
    setLoadingMore(true)
    try {
      const offset = drops.length
      const { data: rows, error: lErr } = await buildDropsQuery().range(offset, offset + PAGE_SIZE - 1)
      if (lErr) throw lErr
      if (gen !== genRef.current) return // a fresh main load superseded this page
      const page = (rows ?? []) as Drop[]
      setHasMore(page.length === PAGE_SIZE)
      const fresh = page.filter((d) => !drops.some((x) => x.id === d.id))
      if (fresh.length > 0) {
        const { m, tc, ratingRows } = await fetchStatsFor(fresh)
        if (gen !== genRef.current) return
        setDrops((prev) => [...prev, ...fresh.filter((d) => !prev.some((x) => x.id === d.id))])
        setStats((prev) => new Map([...prev, ...m]))
        setTopicCounts((prev) => new Map([...prev, ...tc]))
        mergeRatingsFromRows(ratingRows)
      }
    } catch {
      /* keep what's loaded; scrolling again retries */
    } finally {
      setLoadingMore(false)
    }
  }
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreRef.current()
      },
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, drops.length])

  // Drops that are in the Following tab ONLY because of a topic follow
  // (author not followed) — those get the "from a topic you follow" badge.
  const viaTopicIds = useMemo(() => {
    if (tab !== 'following') return new Set<string>()
    return new Set(
      topicDrops.filter((d) => !following.has(d.author_id)).map((d) => d.id),
    )
  }, [tab, topicDrops, following])

  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => ({
      key,
      count,
      label: [...drops, ...topicDrops].find((d) => d.topic_key === key)?.title ?? key,
    }))

  const visible = useMemo(() => {
    let list = drops
    if (tab === 'following') {
      const byId = new Map<string, Drop>()
      for (const d of list) if (following.has(d.author_id)) byId.set(d.id, d)
      for (const d of topicDrops) if (!byId.has(d.id)) byId.set(d.id, d)
      list = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    if (tab === 'near') {
      list = list.filter((d) => {
        if (MEDIA_CATEGORIES.includes(d.category)) return true
        if (!isPlaceCategory(d.category)) return true
        if (d.latitude == null || d.longitude == null) return true // unpinned places stay visible
        const km = haversineKm(effective, { lat: d.latitude, lon: d.longitude })
        return km * 0.621371 <= NEAR_MILES
      })
    }
    if (tab === 'putons' && !debounced) {
      // Ranked feed (Put Ons only — Following, Near me and search stay
      // chronological): real engagement floats a drop up, and a freshness
      // bonus keeps brand-new posts in the mix before they have ratings.
      const now = Date.now()
      const rank = (d: Drop) => {
        const s = stats.get(d.id)
        const engage = s
          ? (s.ratingAvg ?? 0) * Math.log2(1 + s.ratingCount) * 2 + s.peaks * 3 + s.saves * 2 + s.comments
          : 0
        const ageH = Math.max(0, (now - new Date(d.created_at).getTime()) / 3.6e6)
        const fresh = ageH < 12 ? 6 : ageH < 48 ? 3 : ageH < 168 ? 1 : 0
        return engage + fresh
      }
      list = [...list].sort(
        (a, b) => rank(b) - rank(a) || +new Date(b.created_at) - +new Date(a.created_at),
      )
    }
    return list
  }, [drops, tab, following, topicDrops, effective, stats, debounced])

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
    { id: 'lists', label: 'Lists' },
  ]

  // Pull-to-refresh: observe the drag at the very top; past the threshold,
  // release re-runs the feed load.
  const onPullStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !refreshing && !loading) pullStartY.current = e.touches[0].clientY
  }
  const onPullMove = (e: React.TouchEvent) => {
    if (pullStartY.current == null) return
    const dy = e.touches[0].clientY - pullStartY.current
    if (dy > 0 && window.scrollY <= 0) setPull(Math.min(dy * 0.45, 90))
    else {
      pullStartY.current = null
      setPull(0)
    }
  }
  const onPullEnd = () => {
    if (pull >= 56) {
      tapHaptic()
      setRefreshNonce((n) => n + 1)
    }
    pullStartY.current = null
    setPull(0)
  }

  return (
    <div onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd} onTouchCancel={onPullEnd}>
      {(pull > 0 || refreshing) && (
        <div
          className="pointer-events-none fixed left-1/2 top-36 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-ink-3 shadow-xl"
          style={{
            transform: `translateX(-50%) translateY(${refreshing ? 0 : Math.min(pull * 0.4, 30)}px) scale(${refreshing ? 1 : Math.min(0.6 + pull / 140, 1)})`,
            opacity: refreshing ? 1 : Math.min(pull / 40, 1),
          }}
        >
          {refreshing ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-sig/30 border-t-sig" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-5 w-5 text-sig transition-transform duration-150"
              style={{ transform: pull >= 56 ? 'rotate(180deg)' : 'none' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v13m0 0l-5-5m5 5l5-5" />
            </svg>
          )}
        </div>
      )}
      <div className="pt-safe sticky top-0 z-30 border-b border-line bg-ink/95 px-4 pb-1.5 pt-2.5 backdrop-blur">
        {/* TikTok-style top bar: bell | text tabs | search */}
        <div className="mb-1 flex items-center justify-between">
          <AlertsBell />
          <div className="flex items-center gap-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (tab === t.id) {
                    // Tapping the active tab: back to the top — or refresh if already there.
                    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' })
                    else {
                      tapHaptic()
                      setRefreshNonce((n) => n + 1)
                    }
                  } else {
                    setTab(t.id)
                  }
                }}
                className={`relative whitespace-nowrap px-1 py-1 text-[14px] transition ${
                  tab === t.id ? 'font-black text-fog' : 'font-bold text-mute hover:text-fog'
                }`}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute -bottom-[1px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-sig" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search put-ons"
            className={`flex h-9 w-9 items-center justify-center transition ${
              searchOpen || query ? 'text-sig' : 'text-fog hover:text-sig'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        </div>
        {searchOpen && tab !== 'lists' && (
          <div className="mb-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a put-on…"
              className="w-full rounded-full border border-line bg-ink-2 px-4 py-2 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
            />
          </div>
        )}
        {tab !== 'lists' && <CategoryTabs group={group} sub={sub} onGroup={pickGroup} onSub={setSub} />}
        {tab !== 'lists' && locState.status !== 'on' && (
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

      {!loading && tab === 'putons' && <OnboardingChecklist />}

      {!loading && !error && tab === 'near' && visible.length > 0 && (
        <div className="flex justify-center px-4 pt-3">
          <div className="flex rounded-full border border-line bg-ink-2 p-1">
            {(['list', 'map'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setNearView(v)}
                className={`rounded-full px-5 py-1.5 text-sm font-black capitalize transition ${
                  nearView === v ? 'bg-sig text-ink' : 'text-mute'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {tastemakers.length > 0 && tab === 'putons' && (
        <div className="border-b border-line px-4 py-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-mute">Proven taste</span>
            <span className="doodle text-lg leading-none text-lilac">the ones getting it right</span>
          </div>
          <div className="rail-scroll flex gap-4 overflow-x-auto pb-1">
            {tastemakers.map((p) => (
              <button key={p.id} onClick={() => navigate(`/profile/${p.id}`)} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <span className="rounded-full p-[2px]" style={{ boxShadow: '0 0 0 2px var(--color-ink), 0 0 0 4px var(--color-sig)' }}>
                  <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={52} />
                </span>
                <span className="w-full truncate text-center text-[10px] font-bold">@{p.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'putons' && !debounced && yday && (
        <button
          onClick={() => navigate(`/drop/${yday.drop.id}`)}
          className="block w-full border-b border-line bg-ink-2 px-4 py-3 text-left transition hover:border-sig/50"
        >
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-butter">
            Yesterday's top call
          </span>
          <span className="mt-0.5 block truncate text-[15px] font-bold">
            {yday.drop.title}
            <span className="ml-2 text-sm font-black">
              <span className="text-sig">{formatAvg(yday.avg)} avg</span>
              <span className="text-mute"> · </span>
              <span className="text-mute">{yday.count} ratings{yday.peaks > 0 ? ` · ${yday.peaks} peaked` : ''}</span>
            </span>
          </span>
          <span className="block text-xs text-mute">
            by @{yday.drop.author?.username ?? '?'} — see why it landed
          </span>
        </button>
      )}

      {tab === 'putons' && !debounced && <RequestsStrip />}
      {tab === 'putons' && !debounced && <ContestedRail />}

      {tab === 'lists' ? (
        <ListsFeed refreshNonce={refreshNonce} />
      ) : loading ? (
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
        <EmptyState title="Couldn't load drops" body={error} mood="sleepy" action={
          <button onClick={() => window.location.reload()} className="btn-pop press px-6 py-2.5 text-sm">
            Try again
          </button>
        } />
      ) : visible.length === 0 ? (
        tab === 'following' && !debounced && (tastemakers.length > 0 || topTopics.length > 0) ? (
          <FollowingSuggestions
            people={tastemakers.filter((p) => p.id !== user?.id && !following.has(p.id)).slice(0, 5)}
            topics={topTopics}
          />
        ) : (
        <EmptyState
          mood={debounced ? 'sleepy' : 'happy'}
          title={
            debounced
              ? 'No put-ons match that search'
              : tab === 'following'
                ? "It's a little too quiet in here"
                : tab === 'near'
                  ? 'Nothing near you yet'
                  : "It's a little too quiet in here"
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
            <button onClick={() => navigate('/create')} className="btn-pop press px-6 py-2.5 text-sm">
              Put someone on
            </button>
          }
        />
        )
      ) : tab === 'near' && nearView === 'map' ? (
        <DropMap drops={visible} center={effective} />
      ) : (
        visible.map((d, i) => (
          <DropCard
            key={d.id}
            drop={d}
            stats={stats.get(d.id) ?? { saves: 0, comments: 0, ratingAvg: null, ratingCount: 0, peaks: 0 }}
            saved={mySaves.has(d.id)}
            onToggleSave={() => toggleSave(d.id)}
            myRating={myRatings.get(d.id) ?? null}
            changeSpent={myChanges.get(d.id) ?? false}
            onRate={(prefill) => setRateTarget({ drop: d, prefill: prefill ?? null })}
            onRateNow={(score) => void rate(d.id, score, setStats)}
            revealDelay={(i % 6) * 70}
            onAuthorBlocked={(authorId) => setDrops((ds) => ds.filter((x) => x.author_id !== authorId))}
            topicCount={d.topic_key ? (topicCounts.get(d.topic_key) ?? null) : null}
            viaTopic={viaTopicIds.has(d.id)}
          />
        ))
      )}

      {rateTarget && (
        <RateSheet
          title={rateTarget.drop.title}
          current={myRatings.get(rateTarget.drop.id) ?? null}
          locked={myChanges.get(rateTarget.drop.id) ?? false}
          prefill={rateTarget.prefill}
          onRate={(score) => void rate(rateTarget.drop.id, score, setStats)}
          onRemove={() => void unrate(rateTarget.drop.id, setStats)}
          onClose={() => setRateTarget(null)}
        />
      )}

      {hasMore && !loading && visible.length > 0 && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-sig/30 border-t-sig" />
          ) : (
            <button
              onClick={() => void loadMore()}
              className="press rounded-full border border-line px-6 py-2.5 text-sm font-bold text-fog"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
