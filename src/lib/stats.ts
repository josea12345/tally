/** Reputation math: ratings summaries, Taste Score, Trust, badges, leaderboard,
 *  taste twins. All from real typed ratings (0.0–10.0; a 10.0 is a peak). */
import type { Drop, DropRating, Profile } from './types'
import { normKey } from './format'
import { aggregateScores, tasteScoreFromScores, RATINGS_MINIMUM } from './ratings'

export interface RatingSummary {
  count: number
  peaks: number
  /** Raw mean of every rating received; null when unrated. */
  avg: number | null
  /** Taste Score (0–100): the credibility-weighted average, ×10. Volume earns trust. */
  score: number
  /** True once there's enough rating volume to show the score as a number. */
  enough: boolean
}

/**
 * An author's rating record across all their drops. The raw average stays
 * visible as the audit trail; the Taste Score is the weighted version, so
 * a couple of friendly 10s can't crown anyone (see ratings.ts).
 */
export function ratingSummaryFor(scores: number[]): RatingSummary {
  const a = aggregateScores(scores)
  return {
    count: a.count,
    peaks: a.peaks,
    avg: a.avg,
    score: tasteScoreFromScores(scores),
    enough: a.count >= RATINGS_MINIMUM,
  }
}

/** Taste Score (0–100) from a pile of received scores. */
export function tasteScoreFor(scores: number[]): number {
  return tasteScoreFromScores(scores)
}

export interface TrustBreakdown {
  /** 0–100, or null when there isn't enough rating data yet. */
  score: number | null
  qualifyingDrops: number
  /** Mean |author score − community mean| across qualifying drops. */
  meanDiff: number | null
  accuracy: number | null
  engagement: number
  interactions: number
}

/** Trust needs at least this many drops with an author score + community ratings. */
export const TRUST_MIN_DROPS = 2

/**
 * Trust Score: do your calls hold up?
 *
 * 70% rating accuracy — across your drops that have your own score plus at
 * least 2 community (non-author) comment ratings, how close is your score to
 * the community's mean? A 1-point miss on the 0–10 scale costs 10 points of
 * accuracy. 30% engagement — log-scaled interactions (ratings + comments +
 * saves) on your drops, maxing out at ~100. Both halves are earned, never
 * given: no community ratings, no score.
 */
export function trustScoreFor(
  drops: Array<{ score: number | null; community: number[] }>,
  totalInteractions: number
): TrustBreakdown {
  const diffs: number[] = []
  for (const d of drops) {
    if (d.score == null || d.community.length < 2) continue
    const mean = d.community.reduce((a, b) => a + b, 0) / d.community.length
    diffs.push(Math.abs(d.score - mean))
  }
  const engagement = Math.min(1, Math.log10(1 + totalInteractions) / 2)
  if (diffs.length < TRUST_MIN_DROPS) {
    return {
      score: null,
      qualifyingDrops: diffs.length,
      meanDiff: null,
      accuracy: null,
      engagement,
      interactions: totalInteractions,
    }
  }
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const accuracy = Math.max(0, 1 - meanDiff / 10)
  return {
    score: Math.round(100 * (0.7 * accuracy + 0.3 * engagement)),
    qualifyingDrops: diffs.length,
    meanDiff,
    accuracy,
    engagement,
    interactions: totalInteractions,
  }
}

export interface Badge {
  id: string
  title: string
  detail: string
}

interface RatingWithDrop extends DropRating {
  drop: Drop
}

/** Earned badges, each printing the numbers that earned it. Thresholds are deliberate and shown. */
export function badgesFor(
  drops: Drop[],
  ratingsReceived: RatingWithDrop[],
  savesPerDrop: Map<string, number>,
  firstCount: number
): Badge[] {
  const badges: Badge[] = []

  // Mountain magnet: 5+ peaks (10.0 ratings) earned across your drops.
  const peaks = ratingsReceived.filter((r) => r.score === 10).length
  if (peaks >= 5) {
    badges.push({
      id: 'peaks',
      title: 'Mountain magnet',
      detail: `${peaks} peaks (10.0 ratings) earned across your drops`,
    })
  }

  // Neighborhood oracle: a neighborhood with >=5 ratings averaging 9.0+.
  const byHood = new Map<string, number[]>()
  for (const r of ratingsReceived) {
    const hood = r.drop.neighborhood?.trim()
    if (!hood) continue
    const arr = byHood.get(hood) ?? []
    arr.push(r.score)
    byHood.set(hood, arr)
  }
  for (const [hood, scores] of byHood) {
    if (scores.length < 5) continue
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    if (avg >= 9) {
      badges.push({
        id: `oracle-${hood}`,
        title: `${hood} Oracle`,
        detail: `Averaging ${avg.toFixed(1)} across ${scores.length} ratings in ${hood}`,
      })
      break
    }
  }

  // First to drop it.
  if (firstCount > 0) {
    badges.push({
      id: 'first',
      title: 'First to drop it',
      detail: `First to put people on to ${firstCount} ${firstCount === 1 ? 'spot' : 'spots'}`,
    })
  }

  // Crowd favorite: a drop with >= 5 saves (bets).
  let best: { title: string; saves: number } | null = null
  for (const [dropId, n] of savesPerDrop) {
    const d = drops.find((x) => x.id === dropId)
    if (d && n >= 5 && (!best || n > best.saves)) best = { title: d.title, saves: n }
  }
  if (best) {
    badges.push({ id: 'crowd', title: 'Crowd favorite', detail: `${best.saves} bets on “${best.title}”` })
  }

  return badges
}

/**
 * "First to drop it" needs the global drop list; computed separately so the
 * caller can pass every drop, not just the author's.
 */
export function firstDropCount(authorId: string, allDrops: Drop[]): number {
  const earliest = new Map<string, { id: string; at: string }>()
  for (const d of allDrops) {
    const k = normKey(d.title, d.city)
    const e = earliest.get(k)
    if (!e || d.created_at < e.at) earliest.set(k, { id: d.id, at: d.created_at })
  }
  let n = 0
  for (const d of allDrops) {
    if (d.author_id !== authorId) continue
    const e = earliest.get(normKey(d.title, d.city))
    if (e && e.id === d.id) n++
  }
  return n
}

export interface LeaderboardRow {
  profile: Profile
  /** Raw mean rating in the window; null when unrated. */
  avg: number | null
  /** Taste Score — the leaderboard sorts by this, not the raw average. */
  score: number
  peaks: number
  ratings: number
  charted: boolean
}

export const LEADERBOARD_MINIMUM = 3

/** Weekly city leaderboard rows, computed from ratings in the window. */
export function buildLeaderboard(
  profiles: Map<string, Profile>,
  ratings: Array<DropRating & { drop: Drop }>,
  sinceIso: string
): LeaderboardRow[] {
  const per = new Map<string, number[]>()
  for (const r of ratings) {
    if (r.created_at < sinceIso) continue
    const arr = per.get(r.drop.author_id) ?? []
    arr.push(r.score)
    per.set(r.drop.author_id, arr)
  }
  const rows: LeaderboardRow[] = []
  for (const [authorId, scores] of per) {
    const profile = profiles.get(authorId)
    if (!profile) continue
    const a = aggregateScores(scores)
    rows.push({
      profile,
      avg: a.avg,
      score: tasteScoreFromScores(scores),
      peaks: a.peaks,
      ratings: a.count,
      charted: a.count >= LEADERBOARD_MINIMUM,
    })
  }
  rows.sort((a, b) => b.score - a.score || b.ratings - a.ratings)
  return rows
}

export interface TasteTwin {
  profile: Profile
  shared: number
  sharedPlaces: string[]
}

/** People who rated the same drops 9.0+ that I did — a discovery graph from ratings. */
export function tasteTwins(
  myId: string,
  myHighDropIds: Set<string>,
  allRatings: DropRating[],
  dropsById: Map<string, Drop>,
  profilesById: Map<string, Profile>
): TasteTwin[] {
  const per = new Map<string, { places: Set<string> }>()
  for (const r of allRatings) {
    if (r.user_id === myId || r.score < 9) continue
    if (!myHighDropIds.has(r.drop_id)) continue
    const e = per.get(r.user_id) ?? { places: new Set<string>() }
    const d = dropsById.get(r.drop_id)
    if (d) e.places.add(d.title)
    per.set(r.user_id, e)
  }
  const twins: TasteTwin[] = []
  for (const [uid, e] of per) {
    const profile = profilesById.get(uid)
    if (!profile) continue
    twins.push({ profile, shared: e.places.size, sharedPlaces: [...e.places].slice(0, 3) })
  }
  twins.sort((a, b) => b.shared - a.shared)
  return twins.slice(0, 12)
}
