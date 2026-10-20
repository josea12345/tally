import { useEffect, useRef, useState } from 'react'
import { SoundOnIcon, SoundOffIcon } from './MediaViewer'

/**
 * One active video at a time across the whole feed (the TikTok rule):
 * every FeedVideo registers its element; the most-visible one plays and
 * the rest pause, instead of every on-screen clip playing at once.
 */
type VideoEntry = { wrap: HTMLElement; vid: HTMLVideoElement; ratio: number }
const videoEntries = new Set<VideoEntry>()
let sharedIo: IntersectionObserver | null = null

function pickActiveVideo() {
  let best: VideoEntry | null = null
  for (const e of videoEntries) {
    if (e.ratio >= 0.45 && (!best || e.ratio > best.ratio)) best = e
  }
  for (const e of videoEntries) {
    if (e === best) {
      // Warm the cache: the viewer reuses this URL, so preload the full
      // clip once it's the active one instead of just metadata.
      if (e.vid.preload !== 'auto') e.vid.preload = 'auto'
      e.vid.play().catch(() => {})
    } else if (!e.vid.paused) {
      e.vid.pause()
    }
  }
}

function ensureVideoIo(): IntersectionObserver | null {
  if (sharedIo || typeof IntersectionObserver === 'undefined') return sharedIo
  sharedIo = new IntersectionObserver(
    (list) => {
      for (const item of list) {
        for (const e of videoEntries) {
          if (e.wrap === item.target) e.ratio = item.intersectionRatio
        }
      }
      pickActiveVideo()
    },
    { threshold: [0, 0.25, 0.45, 0.6, 0.8, 1] },
  )
  return sharedIo
}

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
    const io = ensureVideoIo()
    if (!vid || !wrap || !io) return
    const entry: VideoEntry = { wrap, vid, ratio: 0 }
    videoEntries.add(entry)
    io.observe(wrap)
    return () => {
      videoEntries.delete(entry)
      io.unobserve(wrap)
      vid.pause()
      pickActiveVideo()
    }
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
