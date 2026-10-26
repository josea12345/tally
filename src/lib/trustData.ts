import { supabase } from './supabase'
import { ratingSummaryFor, trustScoreFor, type RatingSummary, type TrustBreakdown } from './stats'

/**
 * The author's Trust breakdown, computed the same way Profile computes
 * it: rating accuracy across their drops (the real drop ratings vs
 * their own calls) + log-scaled engagement (ratings + comments + saves
 * received). Returns null on any failure — Trust is a garnish, never a
 * blocker.
 */
export async function fetchTrustBreakdown(authorId: string): Promise<TrustBreakdown | null> {
  try {
    const { data: drops } = await supabase.from('drops').select('id, score').eq('author_id', authorId).limit(500)
    const list = (drops ?? []) as Array<{ id: string; score: number | null }>
    if (list.length === 0) return trustScoreFor([], 0)
    const ids = list.map((d) => d.id)
    const [{ count: saveCount }, { count: commentCount }, { data: ratingRows }] =
      await Promise.all([
        supabase.from('saves').select('id', { count: 'exact', head: true }).in('drop_id', ids),
        supabase.from('comments').select('id', { count: 'exact', head: true }).in('drop_id', ids),
        supabase.from('drop_ratings').select('drop_id, user_id, score').in('drop_id', ids).limit(5000),
      ])
    const rows = (ratingRows ?? []) as Array<{ drop_id: string; user_id: string; score: number }>
    const communityByDrop = new Map<string, number[]>()
    for (const r of rows) {
      // The author's own ratings never count — their take is the drop's score.
      if (r.user_id === authorId) continue
      const arr = communityByDrop.get(r.drop_id) ?? []
      arr.push(r.score)
      communityByDrop.set(r.drop_id, arr)
    }
    const interactions = rows.length + (commentCount ?? 0) + (saveCount ?? 0)
    return trustScoreFor(
      list.map((d) => ({ score: d.score, community: communityByDrop.get(d.id) ?? [] })),
      interactions
    )
  } catch {
    return null
  }
}

/**
 * The author's OVERALL rating summary across every rating on every drop
 * they posted — their real Taste Score input.
 */
export async function fetchAuthorRatingSummary(authorId: string): Promise<RatingSummary | null> {
  try {
    const { data: myDrops } = await supabase
      .from('drops')
      .select('id')
      .eq('author_id', authorId)
      .limit(2000)
    const ids = ((myDrops ?? []) as Array<{ id: string }>).map((d) => d.id)
    if (ids.length === 0) return null
    const { data: rows } = await supabase
      .from('drop_ratings')
      .select('score')
      .in('drop_id', ids)
      .limit(5000)
    const scores = ((rows ?? []) as Array<{ score: number }>).map((r) => r.score)
    return ratingSummaryFor(scores)
  } catch {
    return null
  }
}
