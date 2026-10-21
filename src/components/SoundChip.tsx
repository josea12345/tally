import { toggleSound, useSoundState } from '../lib/sound'

/** A drop's soundtrack: cover, title, and a play/pause for the preview. */
export default function SoundChip({
  title,
  artist,
  coverUrl,
  previewUrl,
  start = 0,
  end = null,
}: {
  title: string
  artist: string | null
  coverUrl: string | null
  previewUrl: string
  start?: number
  end?: number | null
}) {
  const seg = { start, end }
  const isPlaying = useSoundState(previewUrl, seg)
  const trimmed = start > 0 || end != null
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-3 py-2.5">
      <button
        onClick={() => toggleSound(previewUrl, seg)}
        aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
          isPlaying ? 'bg-sig text-ink' : 'bg-ink-3 text-fog hover:text-sig'
        }`}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-[1px]" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="block truncate text-xs text-mute">
          {artist ? `${artist} · ` : ''}Soundtrack · Deezer preview
          {trimmed ? ` · plays ${fmt(start)}${end != null ? `–${fmt(end)}` : '+'}` : ''}
        </span>
      </span>
      {isPlaying && (
        <span className="ml-auto flex shrink-0 items-end gap-[3px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[3px] animate-pulse rounded-full bg-sig"
              style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  )
}
