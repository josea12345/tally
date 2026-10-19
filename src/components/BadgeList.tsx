import { useBadges } from '../lib/useBadges'
import { SparkIcon } from './icons'

/**
 * "Earned on the record" — transparent badges computed from real verdict data.
 * Presented as collectible stickers: chunky outline, candy fill, pop-in.
 * The profile owner can dismiss a badge (×); dismissal is stored on the
 * profile so it stays gone (restorable in Settings).
 */
const STICKER_FILLS = ['bg-lime', 'bg-lilac', 'bg-butter', 'bg-sky', 'bg-win']

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

  if (badges === null) return <p className="py-3 text-center text-xs text-mute">Cooking something up…</p>

  const visible = badges.filter((b) => !dismissed.includes(b.id))
  if (visible.length === 0) {
    if (badges.length === 0) {
      return (
        <p className="py-3 text-center text-xs text-mute">
          No stickers yet — they're earned from real Ws, not handed out.
        </p>
      )
    }
    return null
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-mute">Earned on the record</h2>
      <div className="grid grid-cols-1 gap-2">
        {visible.map((b, i) => (
          <div
            key={b.id}
            className="pop-in relative flex items-center gap-3 rounded-2xl border-2 border-line bg-ink-2 px-4 py-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span
              className={`flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl border-2 border-[#191725] ${STICKER_FILLS[i % STICKER_FILLS.length]} text-[#191725] shadow-[2px_2px_0_rgba(0,0,0,0.3)]`}
              aria-hidden
            >
              <SparkIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black">{b.title}</div>
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
