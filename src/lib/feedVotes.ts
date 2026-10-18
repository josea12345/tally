import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import type { DropStats } from './types'

export type VoteValue = 'W' | 'L'

function shifted(
  m: Map<string, DropStats>,
  dropId: string,
  from: VoteValue | null,
  to: VoteValue | null,
): Map<string, DropStats> {
  const next = new Map(m)
  const s = next.get(dropId)
  if (!s) return next
  const c = { ...s }
  if (from === 'W') c.wins = Math.max(0, c.wins - 1)
  if (from === 'L') c.losses = Math.max(0, c.losses - 1)
  if (to === 'W') c.wins += 1
  if (to === 'L') c.losses += 1
  next.set(dropId, c)
  return next
}

/**
 * Feed-speed W/L voting with optimistic counts. Voting from the feed implies
 * tried (same as the verdict box's vote path) — the detail page keeps the
 * explicit tried-then-vote flow for people who want it.
 */
export function useFeedVotes() {
  const { user } = useAuth()
  const [myVotes, setMyVotes] = useState<Map<string, VoteValue>>(new Map())
  const [triedIds, setTriedIds] = useState<Set<string>>(new Set())

  const setVotesFromRows = useCallback(
    (rows: Array<{ drop_id: string; verdict: string | null; user_id?: string; tried?: boolean }>) => {
      if (!user) {
        setMyVotes(new Map())
        setTriedIds(new Set())
        return
      }
      const m = new Map<string, VoteValue>()
      const t = new Set<string>()
      for (const r of rows) {
        if (r.user_id !== user.id) continue
        if (r.verdict === 'W' || r.verdict === 'L') m.set(r.drop_id, r.verdict)
        if (r.tried) t.add(r.drop_id)
      }
      setMyVotes(m)
      setTriedIds(t)
    },
    [user],
  )

  const vote = useCallback(
    async (
      dropId: string,
      v: VoteValue,
      setStats: React.Dispatch<React.SetStateAction<Map<string, DropStats>>>,
    ) => {
      if (!user) {
        navigate('/auth')
        return
      }
      const prev = myVotes.get(dropId) ?? null
      if (prev === v) return
      const wasTried = triedIds.has(dropId)
      setMyVotes((m) => new Map(m).set(dropId, v))
      if (!wasTried) setTriedIds((s) => new Set(s).add(dropId))
      setStats((m) => shifted(m, dropId, prev, v))
      try {
        const { error } = await supabase.from('verdicts').upsert(
          { user_id: user.id, drop_id: dropId, tried: true, verdict: v },
          { onConflict: 'user_id,drop_id' },
        )
        if (error) throw error
      } catch {
        // revert the optimistic update
        setMyVotes((m) => {
          const n = new Map(m)
          if (prev) n.set(dropId, prev)
          else n.delete(dropId)
          return n
        })
        if (!wasTried)
          setTriedIds((s) => {
            const n = new Set(s)
            n.delete(dropId)
            return n
          })
        setStats((m) => shifted(m, dropId, v, prev))
      }
    },
    [user, myVotes, triedIds],
  )

  return { myVotes, triedIds, setVotesFromRows, vote }
}
