import { useEffect, useRef, useState } from 'react'
import { SoundOnIcon, SoundOffIcon } from './MediaViewer'

/**
 * TikTok-style feed clip: autoplays muted when on screen, pauses off screen.
 * Tap the video → in-app fullscreen viewer (MediaViewer). Tap the badge → sound.
 * Respects the poster's cover frame. Preload upgrades to full once visible so
 * the viewer opens on warm cache instead of re-buffering.
 */
export default function FeedVideo({
  src,
  poster,
  className = '',
  onDoubleTap,
  onExpand,
}: {
  src: string
  poster?: string | null
  className?: string
  /** Double-tap handler (e.g. vote W). Single tap still expands, delayed to disambiguate. */
  onDoubleTap?: () => void
  /** Open the in-app fullscreen viewer instead of the native player. */
  onExpand?: () => void
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const tapTimer = useRef<number | null>(null)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const vid = ref.current
    const wrap = wrapRef.current
    if (!vid || !wrap || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0]?.isIntersecting ?? false
        if (vis) {
          // Warm the cache: the viewer reuses this URL, so preload the full
          // clip once it's actually on screen instead of just metadata.
          if (vid.preload !== 'auto') vid.preload = 'auto'
          vid.play().catch(() => {})
        } else {
          vid.pause()
        }
      },
      { threshold: 0.45 },
    )
    io.observe(wrap)
    return () => io.disconnect()
  }, [src])

  /** Open the in-app fullscreen viewer (replaces the old native player). */
  const expand = () => {
    if (failed) return
    onExpand?.()
  }

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const vid = ref.current
    if (!vid || failed) return
    const next = !muted
    setMuted(next)
    vid.muted = next
    if (!next) vid.play().catch(() => {})
  }

  /** Tap: single → fullscreen, double → onDoubleTap (disambiguated with a short window). */
  const handleTap = () => {
    if (!onDoubleTap) {
      expand()
      return
    }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current)
      tapTimer.current = null
      onDoubleTap()
    } else {
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = null
        expand()
      }, 280)
    }
  }

  if (failed) return null

  return (
    <div ref={wrapRef} className={`feed-video relative h-full ${className}`}>
      <video
        ref={(el) => {
          ref.current = el
          if (el) el.muted = true
        }}
        src={src}
        poster={poster ?? undefined}
        playsInline
        muted
        loop
        autoPlay
        preload="metadata"
        onError={() => setFailed(true)}
        onClick={handleTap}
        className="h-full w-full bg-black object-cover"
      />
      <button
        onClick={toggleSound}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
      >
        {muted ? <SoundOffIcon className="h-3.5 w-3.5" /> : <SoundOnIcon className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
