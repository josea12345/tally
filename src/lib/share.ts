import type { Drop } from './types'

/**
 * Canonical public link for a drop. Clean /drop/<id> URLs are answered
 * by the OG preview function (api/drop.js), which shows the drop's own
 * title/cover in share previews and bounces humans into the app at
 * /#/drop/<id>.
 */
export function dropShareUrl(id: string): string {
  return `${window.location.origin}/drop/${id}`
}

/**
 * Share a drop: native share sheet where available (all modern phones),
 * clipboard copy as the desktop fallback. Returns what happened so the
 * caller can flash feedback for the copy case.
 */
export async function shareDrop(drop: Drop): Promise<'shared' | 'copied' | 'dismissed' | 'failed'> {
  const url = dropShareUrl(drop.id)
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ title: 'TALLY', text: `Put on: ${drop.title}`, url })
      return 'shared'
    } catch {
      return 'dismissed' // user closed the sheet — not an error
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
