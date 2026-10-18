/** Reputation math: win rates, badges, leaderboard, taste twins. All from real verdict data. */
import type { Drop, Profile, Verdict } from './types'
import { normKey } from './format'

export interface WinRate {
  wins: number
  losses: number
  total: number
  rate: number | null // null when not enough data
  /** Taste Score (0–100): win rate regressed toward 50 until volume earns it. */
  score: number
}

export const WIN_RATE_MINIMUM = 5

/**
 * Taste Score: Bayesian win rate with a 50% prior (2 phantom Ws, 2 phantom Ls).
 * 5W/0L scores 78, not 100 — small samples don't prove much. 90W/10L scores 88
 * and outranks it, because volume earned it. New voices start at 50; every real
 * verdict pulls the score toward the truth. Always explainable: the raw W/L
 * stays visible next to it.
 */
export function tasteScoreFor(wins: number, losses: number): number {
  return Math.round((100 * (wins + 2)) / (wins + losses + 4))
}

export function winRateFor(verdicts: Verdict[]): WinRate {
  const wins = verdicts.filter((v) => v.verdict === 'W').length
  const losses = verdicts.filter((v) => v.verdict === 'L').length
  const total = wins + losses
  return { wins, losses, total, rate: total >= WIN_RATE_MINIMUM ? wins / total : null, score: tasteScoreFor(wins, losses) }
}

export interface Badge {
  id: string
  title: string
  detail: string
}

interface VerdictWithDrop extends Verdict {
  drop: Drop
}

/** Earned badges, each printing the numbers that earned it. Thresholds are deliberate and shown. */
export function badgesFor(
  drops: Drop[],
  verdictsReceived: VerdictWithDrop[],
  savesPerDrop: Map<string, number>,
  firstCount: number
): Badge[] {
  const badges: Badge[] = []
  const decided = verdictsReceived
    .filter((v) => v.verdict === 'W' || v.verdict === 'L')
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))

  // W streak: consecutive Ws from the most recent verdict.
  let streak = 0
  for (const v of decided) {
    if (v.verdict === 'W') streak++
    else break
  }
  if (streak >= 3) {
    badges.push({ id: 'streak', title: `${streak} Ws in a row`, detail: `Last ${streak} verdicts were all Ws` })
  }

  // Neighborhood oracle: a neighborhood with >=5 verdicts, all W.
  const byHood = new Map<string, { wins: number; total: number }>()
  for (const v of decided) {
    const hood = v.drop.neighborhood?.trim()
    if (!hood) continue
    const e = byHood.get(hood) ?? { wins: 0, total: 0 }
    e.total++
    if (v.verdict === 'W') e.wins++
    byHood.set(hood, e)
  }
  for (const [hood, e] of byHood) {
    if (e.total >= 5 && e.wins === e.total) {
      badges.push({ id: `oracle-${hood}`, title: `${hood} Oracle`, detail: `${e.wins} of ${e.total} verdicts were Ws` })
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

  // Crowd favorite: a drop with >= 5 saves.
  let best: { title: string; saves: number } | null = null
  for (const [dropId, n] of savesPerDrop) {
    const d = drops.find((x) => x.id === dropId)
    if (d && n >= 5 && (!best || n > best.saves)) best = { title: d.title, saves: n }
  }
  if (best) {
    badges.push({ id: 'crowd', title: 'Crowd favorite', detail: `${best.saves} saves on “${best.title}”` })
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
  winRate: number
  /** Taste Score — the leaderboard sorts by this, not raw win rate. */
  score: number
  wins: number
  losses: number
  verdicts: number
  charted: boolean
}

export const LEADERBOARD_MINIMUM = 3

/** Weekly city leaderboard rows, computed from verdicts in the window. */
export function buildLeaderboard(
  profiles: Map<string, Profile>,
  verdicts: Array<Verdict & { drop: Drop }>,
  sinceIso: string
): LeaderboardRow[] {
  const per = new Map<string, { wins: number; losses: number }>()
  for (const v of verdicts) {
    if (v.created_at < sinceIso) continue
    if (v.verdict !== 'W' && v.verdict !== 'L') continue
    const e = per.get(v.drop.author_id) ?? { wins: 0, losses: 0 }
    if (v.verdict === 'W') e.wins++
    else e.losses++
    per.set(v.drop.author_id, e)
  }
  const rows: LeaderboardRow[] = []
  for (const [authorId, e] of per) {
    const profile = profiles.get(authorId)
    if (!profile) continue
    const total = e.wins + e.losses
    rows.push({
      profile,
      winRate: total ? e.wins / total : 0,
      score: tasteScoreFor(e.wins, e.losses),
      wins: e.wins,
      losses: e.losses,
      verdicts: total,
      charted: total >= LEADERBOARD_MINIMUM,
    })
  }
  rows.sort((a, b) => b.score - a.score || b.verdicts - a.verdicts)
  return rows
}

export interface TasteTwin {
  profile: Profile
  shared: number
  sharedPlaces: string[]
}

/** People who called W on the same drops I did — a discovery graph from verdicts. */
export function tasteTwins(
  myId: string,
  myWinDropIds: Set<string>,
  allVerdicts: Verdict[],
  dropsById: Map<string, Drop>,
  profilesById: Map<string, Profile>
): TasteTwin[] {
  const per = new Map<string, { places: Set<string> }>()
  for (const v of allVerdicts) {
    if (v.user_id === myId || v.verdict !== 'W') continue
    if (!myWinDropIds.has(v.drop_id)) continue
    const e = per.get(v.user_id) ?? { places: new Set<string>() }
    const d = dropsById.get(v.drop_id)
    if (d) e.places.add(d.title)
    per.set(v.user_id, e)
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
