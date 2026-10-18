import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop, Verdict } from '../lib/types'
import { badgesFor, firstDropCount, type Badge } from '../lib/stats'

/**
 * "Earned on the record" — transparent badges computed from real verdict data.
 * The profile owner can dismiss a badge (×); dismissal is stored on the
 * profile so it stays gone.
 */
export default function BadgeList({
  profileId,
  isOwn,
  dismissed,
  onDismiss,
}: {
  profileId: string
  isOwn: boolean
  dismissed: string[]
  onDismiss: (id: string) => void
}) {
  const [badges, setBadges] = useState<Badge[] | null>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      const [{ data: myDrops }, { data: allDrops }, { data: verdicts }, { data: saves }] = await Promise.all([
        supabase.from('drops').select('*').eq('author_id', profileId),
        supabase.from('drops').select('id,author_id,title,city,created_at').limit(5000),
        supabase.from('verdicts').select('*, drop:drops!inner(id,neighborhood)').limit(5000),
        supabase.from('saves').select('drop_id').limit(5000),
      ])
      if (!live) return
      const mine = new Set(((myDrops ?? []) as Drop[]).map((d) => d.id))
      const received = ((verdicts ?? []) as Array<Verdict & { drop: Drop }>).filter((v) =>
        mine.has(v.drop_id)
      )
      const savesPerDrop = new Map<string, number>()
      for (const s of (saves ?? []) as Array<{ drop_id: string }>) {
        if (!mine.has(s.drop_id)) continue
        savesPerDrop.set(s.drop_id, (savesPerDrop.get(s.drop_id) ?? 0) + 1)
      }
      const first = firstDropCount(profileId, (allDrops ?? []) as Drop[])
      setBadges(badgesFor((myDrops ?? []) as Drop[], received, savesPerDrop, first))
    }
    load()
    return () => {
      live = false
    }
  }, [profileId])

  if (badges === null) return <p className="py-3 text-center text-xs text-mute">Checking the record…</p>

  const visible = badges.filter((b) => !dismissed.includes(b.id))
  if (visible.length === 0) {
    if (badges.length === 0) {
      return (
        <p className="py-3 text-center text-xs text-mute">
          No badges yet — badges are earned from real Ws, not given out.
        </p>
      )
    }
    return null
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-mute">Earned on the record</h2>
      <div className="grid grid-cols-1 gap-2">
        {visible.map((b) => (
          <div key={b.id} className="relative flex items-center gap-3 rounded-2xl border border-lime/40 bg-ink-2 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime text-lg font-black text-ink">
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black text-lime">{b.title}</div>
              <div className="truncate text-xs text-mute">{b.detail}</div>
            </div>
            {isOwn && (
              <button
                onClick={() => onDismiss(b.id)}
                aria-label={`Dismiss badge: ${b.title}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-mute transition hover:bg-ink-3 hover:text-fog"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
