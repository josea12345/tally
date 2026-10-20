import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { navigate } from '../App'

/** @handle pattern — usernames are [a-z0-9_]{3,20}, matched case-insensitively. */
const HANDLE_RE = /@([A-Za-z0-9_]{3,20})/g

/** handle (lowercase) -> profile id, or null when no such user. Module-level
 *  so every rendered mention shares one lookup. */
const cache = new Map<string, string | null>()

export function handlesIn(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(HANDLE_RE)) out.add(m[1].toLowerCase())
  return [...out]
}

/**
 * Renders text with @mentions as tappable profile links. Handles that
 * don't resolve to a real user stay plain text — no fake links.
 */
export default function MentionText({ text }: { text: string }) {
  const [, bump] = useState(0)
  const handles = handlesIn(text)
  const missing = handles.filter((h) => !cache.has(h))

  useEffect(() => {
    if (missing.length === 0) return
    let live = true
    ;(async () => {
      const { data } = await supabase.from('profiles').select('id, username').in('username', missing)
      const found = new Map(((data ?? []) as Array<{ id: string; username: string }>).map((p) => [p.username, p.id]))
      for (const h of missing) cache.set(h, found.get(h) ?? null)
      if (live) bump((n) => n + 1)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.join(',')])

  const parts: React.ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(HANDLE_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(text.slice(last, idx))
    const handle = m[1].toLowerCase()
    const uid = cache.get(handle)
    if (uid) {
      parts.push(
        <span
          key={k++}
          role="link"
          className="font-bold text-sig"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/profile/${uid}`)
          }}
        >
          @{m[1]}
        </span>,
      )
    } else {
      parts.push(`@${m[1]}`)
    }
    last = idx + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
