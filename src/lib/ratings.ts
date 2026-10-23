/** Typed decimal scores: parsing, display, aggregation, and the weighted math
 *  behind Taste Score. One scale everywhere: 0.0–10.0, typed not picked.
 *  A 10.0 is a mountain — "it got peaked." */

export const SCORE_MIN = 0
export const SCORE_MAX = 10

/** Enough ratings before an author's Taste Score is shown as a number. */
export const RATINGS_MINIMUM = 5

/**
 * Parse what a user typed into a score. Forgiving on purpose:
 *  - "8.3" -> 8.3, "8" -> 8, "10" / "10.0" -> 10 (a peak)
 *  - "83" -> 8.3 and "100" -> 10 (bare integers 11–100 read as tenths —
 *    typing on a decimal pad, people skip the dot)
 *  - extra precision rounds to one decimal ("7.55" -> 7.6)
 * Anything else (letters, two dots, >10 with a dot, negatives) -> null.
 */
export function parseScoreInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (s === '' || s === '.') return null
  if (!/^\d*\.?\d*$/.test(s)) return null
  let v = Number.parseFloat(s)
  if (Number.isNaN(v)) return null
  if (v > SCORE_MAX) {
    if (Number.isInteger(v) && v <= 100) v = v / 10
    else return null
  }
  v = Math.round(v * 10) / 10
  if (v < SCORE_MIN || v > SCORE_MAX) return null
  return v
}

/** A single score as shown on chips: "8.3", and a clean "10" for a peak. */
export function formatScore(v: number): string {
  return v === 10 ? '10' : v.toFixed(1)
}

/** An average always keeps its decimal: "8.7", "9.0". */
export function formatAvg(v: number): string {
  return v.toFixed(1)
}

export function isPeak(v: number): boolean {
  return v === 10
}

export interface RatingAggregate {
  count: number
  sum: number
  /** Raw mean, null when nobody has rated yet. */
  avg: number | null
  /** How many 10.0s — mountains. */
  peaks: number
}

export function aggregateScores(scores: number[]): RatingAggregate {
  const count = scores.length
  const sum = scores.reduce((a, b) => a + b, 0)
  return {
    count,
    sum,
    avg: count ? sum / count : null,
    peaks: scores.filter((s) => s === 10).length,
  }
}

/**
 * Credibility weighting (Bayesian shrinkage): an average pulled toward the
 * prior mean until real volume arrives, so 2 ratings can't crown or sink
 * anyone and 200 ratings speak at full volume. This is what replaced the
 * Wilson win-rate bound when verdicts retired.
 */
export const PRIOR_MEAN = 7
export const PRIOR_WEIGHT = 4

export function weightedAverage(sum: number, count: number): number {
  return (sum + PRIOR_MEAN * PRIOR_WEIGHT) / (count + PRIOR_WEIGHT)
}

/** Taste Score 0–100 from a pile of received scores. */
export function tasteScoreFromScores(scores: number[]): number {
  if (scores.length === 0) return 0
  const { sum, count } = aggregateScores(scores)
  return Math.max(0, Math.min(100, Math.round(weightedAverage(sum, count) * 10)))
}
