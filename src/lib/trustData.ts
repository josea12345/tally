import { supabase } from './supabase'
import { trustScoreFor, winRateFor, type TrustBreakdown, type WinRate } from './stats'

/**
 * The author's Trust breakdown, computed the same way Profile computes
 * it: rating accuracy across their drops (community comment ratings vs
 * their own scores) + log-scaled engagement (verdicts + comments + saves
 * received). Returns null on any failure — Trust is a garnish, never a
 * blocker.
 */
export async function fetchTrustBreakdown(authorId: string): Promise<TrustBreakdown | null> {
  try {
    const { data: drops } = await supabase.from('drops').select('id, score').eq('author_id', authorId).limit(500)
    const list = (drops ?? []) as Array<{ id: string; score: number | null }>
    if (list.length === 0) return trustScoreFor([], 0)
    const ids = list.map((d) => d.id)
    const [{ count: saveCount }, { count: verdictCount }, { count: commentCount }, { data: rated }] =
      await Promise.all([
        supabase.from('saves').select('id', { count: 'exact', head: true }).in('drop_id', ids),
        supabase.from('verdicts').select('id', { count: 'exact', head: true }).in('drop_id', ids),
        supabase.from('comments').select('id', { count: 'exact', head: true }).in('drop_id', ids),
        supabase
          .from('comments')
          .select('drop_id, user_id, rating')
          .in('drop_id', ids)
          .not('rating', 'is', null)
          .limit(2000),
      ])
    const communityByDrop = new Map<string, number[]>()
    for (const rc of (rated ?? []) as Array<{ drop_id: string; user_id: string; rating: number }>) {
      // The author's own comment ratings don't count — their take is the drop's score.
      if (rc.user_id === authorId) continue
      const arr = communityByDrop.get(rc.drop_id) ?? []
      arr.push(rc.rating)
      communityByDrop.set(rc.drop_id, arr)
    }
    const interactions = (verdictCount ?? 0) + (commentCount ?? 0) + (saveCount ?? 0)
    return trustScoreFor(
      list.map((d) => ({ score: d.score, community: communityByDrop.get(d.id) ?? [] })),
      interactions
    )
  } catch {
    return null
  }
}

/**
 * The author's OVERALL win rate across every verdict on every drop they
 * posted — their real Taste Score input. (The taste card previously showed
 * a "Taste Score" computed from one drop's verdicts only; this is the
 * honest all-time record.)
 */
export async function fetchAuthorWinRate(authorId: string): Promise<WinRate | null> {
  try {
    const { data: myDrops } = await supabase
      .from('drops')
      .select('id')
      .eq('author_id', authorId)
      .limit(2000)
    const ids = ((myDrops ?? []) as Array<{ id: string }>).map((d) => d.id)
    if (ids.length === 0) return null
    const { data: rows } = await supabase
      .from('verdicts')
      .select('verdict')
      .in('drop_id', ids)
      .limit(5000)
    const verdicts = ((rows ?? []) as Array<{ verdict: string | null }>).filter(
      (r): r is { verdict: 'W' | 'L' } => r.verdict === 'W' || r.verdict === 'L',
    )
    return winRateFor(verdicts as unknown as Verdict[])
  } catch {
    return null
  }
}
