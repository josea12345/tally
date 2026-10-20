/**
 * Drops this device has opened — the feed dims their titles so
 * scrolling back feels fresh, not repetitive. Local only, capped.
 */
const KEY = 'tally-seen-drops-v1'
const CAP = 500

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

let cache: Set<string> | null = null

function seenSet(): Set<string> {
  if (!cache) cache = new Set(read())
  return cache
}

export function isSeen(id: string): boolean {
  return seenSet().has(id)
}

export function markSeen(id: string): void {
  const s = seenSet()
  if (s.has(id)) return
  s.add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...s].slice(-CAP)))
  } catch {
    // private mode / quota — dimming is best-effort
  }
}
