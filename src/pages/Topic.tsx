import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import type { Drop } from '../lib/types'
import type { DropStats } from '../lib/feedVotes'
import { useFeedVotes } from '../lib/feedVotes'
import DropCard from '../components/DropCard'

/**
 * "All put-ons about this" — every drop sharing a topic_key (same IMDb id,
 * or same normalized title [+ city for local categories]). Fully interactive
 * feed cards; RLS (is_drop_visible) hides blocked/private drops automatically.
 */
export default function Topic({ topicKey }: { topicKey: string }) {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
  const [stats, setStats] = useState<Map<string, DropStats>>(new Map())
  const [mySaves, setMySaves] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const { myVotes, setVotesFromRows, vote } = useFeedVotes()

  useEffect(() => {
    let live = true
    ;(async () => {
      setLoading(true)
      const { data: rows } = await supabase
        .from('drops')
        .select('*, author:profiles(*)')
        .eq('topic_key', topicKey)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!live) return
      const list = (rows ?? []) as Drop[]
      setDrops(list)
      const ids = list.map((d) => d.id)
      if (ids.length > 0) {
        const [{ data: saves }, { data: verdicts }, { data: cmts }, { data: mySaveRows }, { data: myVoteRows }] =
          await Promise.all([
            supabase.from('saves').select('drop_id').in('drop_id', ids).limit(5000),
            supabase.from('verdicts').select('drop_id,verdict,user_id').in('drop_id', ids).limit(5000),
            supabase.from('comments').select('drop_id').in('drop_id', ids).limit(5000),
            user
              ? supabase.from('saves').select('drop_id').eq('user_id', user.id).in('drop_id', ids)
              : Promise.resolve({ data: [] as Array<{ drop_id: string }> }),
            user
              ? supabase.from('verdicts').select('drop_id,verdict').eq('user_id', user.id).in('drop_id', ids)
              : Promise.resolve({ data: [] as Array<{ drop_id: string; verdict: string | null }> }),
          ])
        if (!live) return
        const m = new Map<string, DropStats>()
        for (const id of ids) m.set(id, { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 })
        for (const s of (saves ?? []) as Array<{ drop_id: string }>) m.get(s.drop_id)!.saves++
        for (const v of (verdicts ?? []) as Array<{ drop_id: string; verdict: string | null }>) {
          const e = m.get(v.drop_id)!
          if (v.verdict === 'W') e.wins++
          else if (v.verdict === 'L') e.losses++
        }
        for (const c of (cmts ?? []) as Array<{ drop_id: string }>) m.get(c.drop_id)!.comments++
        setStats(m)
        setMySaves(new Set(((mySaveRows ?? []) as Array<{ drop_id: string }>).map((r) => r.drop_id)))
        setVotesFromRows((myVoteRows ?? []) as Array<{ drop_id: string; verdict: string | null }>)
      }
      if (live) setLoading(false)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey])

  const toggleSave = async (dropId: string) => {
    if (!user) {
      navigate('/auth')
      return
    }
    const saved = mySaves.has(dropId)
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
      setMySaves((prev) => {
        const n = new Set(prev)
        if (saved) n.add(dropId)
        else n.delete(dropId)
        return n
      })
    }
  }

  const title = drops[0]?.title ?? 'Put-ons'

  return (
    <div className="screen-in mx-auto max-w-xl px-4 pb-24 pt-5">
      <button
        onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink-3 text-fog"
        aria-label="Back"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="wordmark text-3xl leading-tight">{title}</h1>
      <p className="mt-1 text-sm text-mute">
        {loading ? 'Loading…' : `${drops.length} put-on${drops.length === 1 ? '' : 's'} about this`}
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {drops.map((d, i) => (
          <DropCard
            key={d.id}
            drop={d}
            stats={stats.get(d.id) ?? { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 }}
            saved={mySaves.has(d.id)}
            onToggleSave={() => toggleSave(d.id)}
            myVote={myVotes.get(d.id) ?? null}
            onVote={(v) => vote(d.id, v, setStats, d.author_id)}
            revealDelay={(i % 6) * 70}
            onAuthorBlocked={(authorId) => setDrops((ds) => ds.filter((x) => x.author_id !== authorId))}
          />
        ))}
      </div>

      {!loading && drops.length === 0 && (
        <p className="mt-10 text-center text-sm text-mute">No put-ons here yet.</p>
      )}
    </div>
  )
}
