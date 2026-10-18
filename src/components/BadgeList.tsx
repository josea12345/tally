import { useBadges } from '../lib/useBadges'

/**
 * "Earned on the record" — transparent badges computed from real verdict data.
 * The profile owner can dismiss a badge (×); dismissal is stored on the
 * profile so it stays gone (restorable in Settings).
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
  const badges = useBadges(profileId)

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
