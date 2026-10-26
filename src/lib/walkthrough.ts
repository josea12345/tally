/**
 * First-run walkthrough state. Seen-flags live in localStorage per
 * user (device-local, like the setup checklist's dismissal): a
 * brand-new account sees the tour right after onboarding, and anyone
 * can replay it from Settings via a window event the App shell hears.
 */
export const WALKTHROUGH_EVENT = 'peak:show-walkthrough'

const seenKey = (uid: string) => `tally-walkthrough-seen:${uid}`

export function hasSeenWalkthrough(uid: string): boolean {
  try {
    return localStorage.getItem(seenKey(uid)) === '1'
  } catch {
    return true // storage unavailable — never nag
  }
}

export function markWalkthroughSeen(uid: string): void {
  try {
    localStorage.setItem(seenKey(uid), '1')
  } catch {
    /* private mode — the tour just won't be remembered as seen */
  }
}

export function requestWalkthroughReplay(): void {
  window.dispatchEvent(new Event(WALKTHROUGH_EVENT))
}
