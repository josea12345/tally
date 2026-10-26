import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import type { DropStats } from './types'

/** Shift one drop's aggregate stats after a rating changes from -> to. */
export function shiftRatingStats(c0: DropStats, from: number | null, to: number | null): DropStats {
  const c = { ...c0 }
  let sum = (c.ratingAvg ?? 0) * c.ratingCount
  if (from != null) {
    sum -= from
    c.ratingCount = Math.max(0, c.ratingCount - 1)
    if (from === 10) c.peaks = Math.max(0, c.peaks - 1)
  }
  if (to != null) {
    sum += to
    c.ratingCount += 1
    if (to === 10) c.peaks += 1
  }
  c.ratingAvg = c.ratingCount ? sum / c.ratingCount : null
  return c
}

/** Shift a drop's aggregate stats after my rating changes from -> to. */
function shifted(
  m: Map<string, DropStats>,
  dropId: string,
  from: number | null,
  to: number | null,
): Map<string, DropStats> {
  const next = new Map(m)
  const s = next.get(dropId)
  if (!s) return next
  next.set(dropId, shiftRatingStats(s, from, to))
  return next
}

/**
 * Feed-speed typed ratings with optimistic aggregates. One rating per user
 * per drop; the author never rates their own drop (their score is the
 * drop's call). Mirrors the old useFeedVotes contract so the feed and the
 * saved page wire up the same way.
 */
export function useRatings() {
  const { user } = useAuth()
  const [myRatings, setMyRatings] = useState<Map<string, number>>(new Map())
  // One-change budget (Jose's rule, migration 0055): drop_id -> true once
  // the user has spent their single allowed change on that drop.
  const [myChanges, setMyChanges] = useState<Map<string, boolean>>(new Map())

  const setRatingsFromRows = useCallback(
    (rows: Array<{ drop_id: string; score: number; user_id?: string; change_spent?: boolean }>) => {
      if (!user) {
        setMyRatings(new Map())
        setMyChanges(new Map())
        return
      }
      const m = new Map<string, number>()
      const c = new Map<string, boolean>()
      for (const r of rows) {
        if (r.user_id === user.id) {
          m.set(r.drop_id, r.score)
          c.set(r.drop_id, !!r.change_spent)
        }
      }
      setMyRatings(m)
      setMyChanges(c)
    },
    [user],
  )

  /** Additive variant for feed pagination: merge a new page's ratings in. */
  const mergeRatingsFromRows = useCallback(
    (rows: Array<{ drop_id: string; score: number; user_id?: string; change_spent?: boolean }>) => {
      if (!user) return
      setMyRatings((prev) => {
        const m = new Map(prev)
        for (const r of rows) {
          if (r.user_id === user.id) m.set(r.drop_id, r.score)
        }
        return m
      })
      setMyChanges((prev) => {
        const c = new Map(prev)
        for (const r of rows) {
          if (r.user_id === user.id) c.set(r.drop_id, !!r.change_spent)
        }
        return c
      })
    },
    [user],
  )

  const rate = useCallback(
    async (
      dropId: string,
      score: number,
      setStats: React.Dispatch<React.SetStateAction<Map<string, DropStats>>>,
    ) => {
      if (!user) {
        navigate('/login')
        return
      }
      const prev = myRatings.get(dropId) ?? null
      if (prev === score) return
      // Locked: the one change is spent (the DB trigger also rejects).
      if (prev != null && myChanges.get(dropId)) return
      const isChange = prev != null
      if (isChange) setMyChanges((c) => new Map(c).set(dropId, true))
      setMyRatings((m) => new Map(m).set(dropId, score))
      setStats((m) => shifted(m, dropId, prev, score))
      const { error } = await supabase
        .from('drop_ratings')
        .upsert({ user_id: user.id, drop_id: dropId, score }, { onConflict: 'user_id,drop_id' })
      if (error) {
        if (isChange) setMyChanges((c) => new Map(c).set(dropId, false))
        setMyRatings((m) => {
          const n = new Map(m)
          if (prev == null) n.delete(dropId)
          else n.set(dropId, prev)
          return n
        })
        setStats((m) => shifted(m, dropId, score, prev))
      }
    },
    [user, myRatings, myChanges],
  )

  const unrate = useCallback(
    async (
      dropId: string,
      setStats: React.Dispatch<React.SetStateAction<Map<string, DropStats>>>,
    ) => {
      if (!user) return
      const prev = myRatings.get(dropId) ?? null
      if (prev == null) return
      setMyRatings((m) => {
        const n = new Map(m)
        n.delete(dropId)
        return n
      })
      setStats((m) => shifted(m, dropId, prev, null))
      const { error } = await supabase
        .from('drop_ratings')
        .delete()
        .eq('user_id', user.id)
        .eq('drop_id', dropId)
      if (error) {
        setMyRatings((m) => new Map(m).set(dropId, prev))
        setStats((m) => shifted(m, dropId, null, prev))
      }
    },
    [user, myRatings],
  )

  return { myRatings, myChanges, setRatingsFromRows, mergeRatingsFromRows, rate, unrate }
}
