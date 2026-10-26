/**
 * Hash-route parsing — pure and dependency-free so it can be unit
 * tested. Malformed hashes must NEVER throw: a bad link (truncated
 * percent-escapes, empty segments, unknown names) falls back to home.
 */

export interface Route {
  name:
    | 'home'
    | 'auth'
    | 'onboarding'
    | 'drop'
    | 'create'
    | 'edit'
    | 'filter'
    | 'video'
    | 'camera'
    | 'saved'
    | 'profile'
    | 'people'
    | 'search'
    | 'notifications'
    | 'settings'
    | 'followers'
    | 'following'
    | 'topic'
    | 'leaderboard'
    | 'list'
    | 'requests'
    | 'request'
  param?: string
}

/** decodeURIComponent that survives malformed escapes ('%', '%zz'). */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function parseHashString(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/'
  const parts = h.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  const [a, b] = parts
  if (a === 'drop' && b) return { name: 'drop', param: b }
  if (a === 'topic' && b) return { name: 'topic', param: safeDecode(b) }
  if (a === 'edit' && b) return { name: 'edit', param: b }
  if (a === 'followers' && b) return { name: 'followers', param: b }
  if (a === 'following' && b) return { name: 'following', param: b }
  if (a === 'profile' && b) return { name: 'profile', param: safeDecode(b) }
  if (a === 'profile') return { name: 'profile' }
  if (a === 'create') return { name: 'create' }
  if (a === 'filter') return { name: 'filter' }
  if (a === 'video') return { name: 'video' }
  if (a === 'camera') return { name: 'camera' }
  if (a === 'saved') return { name: 'saved' }
  if (a === 'search') return { name: 'search' }
  if (a === 'leaderboard') return { name: 'leaderboard' }
  if (a === 'list' && b) return { name: 'list', param: b }
  if (a === 'requests') return { name: 'requests' }
  if (a === 'request' && b) return { name: 'request', param: b }
  if (a === 'notifications') return { name: 'notifications' }
  if (a === 'settings') return { name: 'settings' }
  if (a === 'onboarding') return { name: 'onboarding' }
  if (a === 'auth') return { name: 'auth' }
  return { name: 'home' }
}
