/**
 * Web Share Target intake: another app shares a link/text to Peak,
 * landing on /share?title=&text=&url=. We stash it, bounce to the
 * composer, and prefill. (Android/Chrome PWAs; iOS doesn't support
 * share targets for web apps yet.)
 */
export interface SharedContent {
  title: string
  text: string
  url: string
}

const KEY = 'tally-shared-v1'

export function captureSharedContent(): boolean {
  if (window.location.pathname !== '/share') return false
  const q = new URLSearchParams(window.location.search)
  const content: SharedContent = {
    title: q.get('title') ?? '',
    text: q.get('text') ?? '',
    url: q.get('url') ?? '',
  }
  if (!content.title && !content.text && !content.url) return false
  try {
    sessionStorage.setItem(KEY, JSON.stringify(content))
  } catch {
    // private mode — sharing prefill is best-effort
  }
  return true
}

export function takeSharedContent(): SharedContent | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as SharedContent
    return {
      title: parsed.title ?? '',
      text: parsed.text ?? '',
      url: parsed.url ?? '',
    }
  } catch {
    return null
  }
}
