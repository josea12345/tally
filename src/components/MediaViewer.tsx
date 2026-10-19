import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CarouselItem } from '../lib/types'

/**
 * TikTok-style fullscreen media viewer. One viewer for both photos and video:
 * fast springy open (~200ms), minimal chrome, media fills the screen.
 *
 * Video: tap toggles play/pause (250ms double-tap window), starts with sound
 * (falls back to muted if the browser blocks unmuted autoplay outside the
 * tap gesture), slim progress bar, sound toggle.
 * Photo: single tap closes, double-tap fires onDoubleTap (W).
 */
export default function MediaViewer({
  item,
  onClose,
  onDoubleTap,
}: {
  item: CarouselItem
  onClose: () => void
  onDoubleTap: () => void
}) {
  const isVideo = item.type === 'video'
  const vidRef = useRef<HTMLVideoElement | null>(null)
  const tapTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [flash, setFlash] = useState<'play' | 'pause' | 'w' | null>(null)
  const [failed, setFailed] = useState(false)

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Start playback immediately on open. Unmuted is allowed when the open came
  // from a tap, but if the browser rejects it (gesture chain broken), fall
  // back to muted rather than stalling on a black frame.
  useEffect(() => {
    const vid = vidRef.current
    if (!vid || !isVideo) return
    vid.muted = false
    vid.play().catch(() => {
      setMuted(true)
      if (vidRef.current) {
        vidRef.current.muted = true
        vidRef.current.play().catch(() => {})
      }
    })
  }, [isVideo, item.url])

  const showFlash = (f: 'play' | 'pause' | 'w') => {
    setFlash(f)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 650)
  }

  const togglePlay = () => {
    const vid = vidRef.current
    if (!vid) return
    if (vid.paused) {
      vid.play().catch(() => {})
      setPlaying(true)
      showFlash('play')
    } else {
      vid.pause()
      setPlaying(false)
      showFlash('pause')
    }
  }

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const vid = vidRef.current
    if (!vid) return
    const next = !muted
    setMuted(next)
    vid.muted = next
    if (!next) vid.play().catch(() => {})
  }

  const handleTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current)
      tapTimer.current = null
      showFlash('w')
      onDoubleTap()
      return
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null
      if (isVideo) togglePlay()
      else onClose()
    }, 250)
  }

  if (failed) {
    onClose()
    return null
  }

  return createPortal(
    <div
      className="viewer-in fixed inset-0 z-[100] flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={isVideo ? 'Video viewer' : 'Photo viewer'}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      {isVideo ? (
        <video
          key={item.url}
          ref={vidRef}
          src={item.url}
          poster={item.posterUrl ?? undefined}
          playsInline
          loop
          preload="auto"
          onClick={(e) => {
            e.stopPropagation()
            handleTap()
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            setProgress(v.duration > 0 ? v.currentTime / v.duration : 0)
          }}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <img
          src={item.url}
          alt=""
          onClick={(e) => {
            e.stopPropagation()
            handleTap()
          }}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      )}

      {/* tap feedback flash */}
      {flash && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {flash === 'w' ? (
            <span className="pop-in text-7xl font-black text-win drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">W</span>
          ) : (
            <span className="pop-in flex h-20 w-20 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              {flash === 'play' ? <PlayIcon /> : <PauseIcon />}
            </span>
          )}
        </div>
      )}

      {/* minimal chrome */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close viewer"
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
        >
          <CloseIcon />
        </button>
        {isVideo && (
          <button
            onClick={toggleSound}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
        )}
      </div>

      {/* slim progress bar */}
      {isVideo && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15 pb-[env(safe-area-inset-bottom)]">
          <div className="h-[3px] bg-sig transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>,
    document.body,
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="ml-1 text-white">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" className="text-white">
      <rect x="6" y="5" width="4.5" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.5" />
    </svg>
  )
}

export function SoundOnIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

export function SoundOffIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </svg>
  )
}
