import { supabase } from './supabase'

/** Monday (local) of the week containing `d`, as a YYYY-MM-DD key. */
export function weekKey(d: Date): string {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (out.getDay() + 6) % 7 // 0 = Monday
  out.setDate(out.getDate() - dow)
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(
    out.getDate(),
  ).padStart(2, '0')}`
}

/**
 * Consecutive active weeks up to now. A week counts when the user
 * posted a drop, rated a drop, or commented. If this week has no
 * activity yet, the streak still counts through last week (it breaks
 * when the week ends quiet).
 */
export function streakFromDates(dates: Date[], now = new Date()): number {
  const keys = new Set(dates.map(weekKey))
  if (keys.size === 0) return 0
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = (cursor.getDay() + 6) % 7
  cursor.setDate(cursor.getDate() - dow)
  if (!keys.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7)
  let streak = 0
  while (keys.has(weekKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 7)
  }
  return streak
}

/** A user's current activity streak, from their last year of activity. */
export async function fetchStreak(userId: string): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - 371)
  const iso = since.toISOString()
  const [d, v, c] = await Promise.all([
    supabase.from('drops').select('created_at').eq('author_id', userId).gte('created_at', iso).limit(2000),
    supabase.from('drop_ratings').select('created_at').eq('user_id', userId).gte('created_at', iso).limit(2000),
    supabase.from('comments').select('created_at').eq('user_id', userId).gte('created_at', iso).limit(2000),
  ])
  const dates: Date[] = []
  for (const res of [d, v, c]) {
    for (const r of (res.data ?? []) as Array<{ created_at: string }>) {
      dates.push(new Date(r.created_at))
    }
  }
  return streakFromDates(dates)
}
