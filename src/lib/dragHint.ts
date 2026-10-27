/**
 * Has this user already learned the press-and-hold rating gesture?
 * Learned = they have completed one drag-rate anywhere (card or drop
 * page). Device-local per user, like the theme and walkthrough flags.
 */
const key = (uid: string) => `tally-drag-hint-done:${uid}`

export function dragHintLearned(uid: string | null | undefined): boolean {
  if (!uid) return true
  try {
    return localStorage.getItem(key(uid)) === '1'
  } catch {
    return true // storage unavailable — never nag
  }
}

export function markDragHintLearned(uid: string | null | undefined): void {
  if (!uid) return
  try {
    localStorage.setItem(key(uid), '1')
  } catch {
    /* private mode — the hint just keeps showing */
  }
}
