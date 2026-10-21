import { useEffect, useRef } from 'react'
import { toggleSound, useSoundState, stopSound } from '../lib/sound'

/**
 * The soundtrack as PART of the media (TikTok-style): a glassy pill
 * overlaid on the video/photo — spinning cover disc, song title, and
 * tap to hear the part the author picked, right in the feed. If the
 * card scrolls away while its song plays, the song stops with it.
 */
export default function SoundPill({
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
  const ref = useRef<HTMLButtonElement | null>(null)
  const playingRef = useRef(isPlaying)
  playingRef.current = isPlaying

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (list) => {
        for (const item of list) {
          if (item.target === el && !item.isIntersecting && playingRef.current) stopSound()
        }
      },
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <button
      ref={ref}
      onClick={(e) => {
        e.stopPropagation()
        toggleSound(previewUrl, seg)
      }}
      aria-label={isPlaying ? `Pause ${title}` : `Play ${title} over this post`}
      className="pointer-events-auto flex max-w-[75%] items-center gap-2 rounded-full bg-black/55 py-1.5 pl-1.5 pr-3.5 text-white shadow-lg backdrop-blur-md transition hover:bg-black/70"
    >
      <span className="relative block h-7 w-7 shrink-0">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className={`h-7 w-7 rounded-full object-cover ${isPlaying ? 'animate-[spin_7s_linear_infinite]' : ''}`}
            loading="lazy"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-3 text-[11px]">♪</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-3 w-3 drop-shadow" fill="white" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3 w-3 translate-x-[0.5px] drop-shadow" fill="white" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </span>
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate text-xs font-black">{title}</span>
        {artist && <span className="block truncate text-[10px] font-bold text-white/65">{artist}</span>}
      </span>
    </button>
  )
}
