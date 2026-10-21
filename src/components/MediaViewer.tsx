import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, Touch, TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import type { CarouselItem } from '../lib/types'
import { overlayTextStyle } from '../lib/filters'
import { hiResArtwork } from './ArtworkImage'
import { claimSound, isCurrentSound, pauseSound, playSound, releaseSound, stopSound, toggleSound as togglePreview, useSoundState } from '../lib/sound'

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
  sound,
}: {
  item: CarouselItem
  onClose: () => void
  onDoubleTap: () => void
  /** The drop's soundtrack preview, when it has one (0049/0050). */
  sound?: { previewUrl: string; title: string; start?: number; end?: number | null } | null
}) {
  const isVideo = item.type === 'video'
  const vidRef = useRef<HTMLVideoElement | null>(null)
  /** Set before the player's own seeks (loop wrap, restart) so the
   *  seeked handler doesn't mistake them for a user scrub and yank
   *  the song to a new position mid-play. */
  const wrapSeekRef = useRef(false)
  const tapTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [flash, setFlash] = useState<'play' | 'pause' | 'w' | null>(null)
  const [failed, setFailed] = useState(false)

  // Swipe-to-dismiss: drag the media vertically, release past the threshold
  // to fling it away, otherwise it springs back. A swipe must not trigger
  // the tap handlers, so the click right after a swipe is swallowed.
  const touchRef = useRef<{ y0: number; dy: number; id: number } | null>(null)
  const swipeAt = useRef(0)
  const closeTimer = useRef<number | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragOn, setDragOn] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [seeking, setSeeking] = useState(false)

  const justSwiped = () => Date.now() - swipeAt.current < 500

  // Live-rendered edit region (trim) — the scrubber and loop live inside it.
  const edit = item.edit ?? null
  const regionStart = edit?.trimStart ?? 0
  const regionEnd = (v: HTMLVideoElement) => edit?.trimEnd ?? v.duration ?? 0

  // Scrubber: drag the knob (or tap the bar) to seek.
  const seekToClientX = (clientX: number) => {
    const bar = barRef.current
    const vid = vidRef.current
    if (!bar || !vid || !vid.duration) return
    const r = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const end = regionEnd(vid)
    vid.currentTime = regionStart + ratio * Math.max(end - regionStart, 0)
    setProgress(ratio)
  }

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = { y0: t.clientY, dy: 0, id: t.identifier }
  }
  const onTouchMove = (e: TouchEvent) => {
    const tr = touchRef.current
    if (!tr || leaving) return
    let t: Touch | undefined
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === tr.id) t = e.touches[i]
    }
    const dy = (t ?? e.touches[0]).clientY - tr.y0
    tr.dy = dy
    if (Math.abs(dy) > 8) {
      setDragOn(true)
      setDragY(dy)
    }
  }
  const onTouchEnd = () => {
    const tr = touchRef.current
    touchRef.current = null
    if (!tr || leaving) return
    if (Math.abs(tr.dy) > 110) {
      // Fling away, then close once it's off-screen.
      swipeAt.current = Date.now()
      setDragOn(false)
      setLeaving(true)
      setDragY(tr.dy > 0 ? window.innerHeight : -window.innerHeight)
      closeTimer.current = window.setTimeout(onClose, 200)
    } else {
      setDragOn(false)
      setDragY(0)
    }
  }

  // Soundtrack: photos autoplay the drop's preview while the viewer
  // is open; videos start it themselves via onPlay so the song lands
  // with the picture instead of racing it. Stop on close.
  const soundSeg = sound ? { start: sound.start ?? 0, end: sound.end ?? null } : null
  const soundPlaying = useSoundState(sound?.previewUrl ?? null, soundSeg)
  useEffect(() => {
    if (!sound || isVideo) return
    playSound(sound.previewUrl, soundSeg, -1, edit?.soundVolume, 'viewer')
    return () => stopSound('viewer')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound?.previewUrl, sound?.start, sound?.end, isVideo])

  // While the viewer is open it exclusively drives the soundtrack —
  // a feed video still playing underneath must not restart the song.
  useEffect(() => {
    if (!sound) return
    claimSound('viewer')
    return () => {
      stopSound('viewer')
      releaseSound('viewer')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound?.previewUrl])

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
      if (closeTimer.current) clearTimeout(closeTimer.current)
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
      if (vid.currentTime >= regionEnd(vid) - 0.05) vid.currentTime = regionStart
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
    if (justSwiped()) return
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

  // Media follows the finger while dragging, with a slight shrink + backdrop
  // fade for the iOS-photos feel. Springs back on release under the threshold.
  const dragMag = Math.abs(dragY)
  const mediaStyle: CSSProperties = {
    transform: `translateY(${dragY}px) scale(${1 - Math.min(dragMag / 1400, 0.07)})`,
    transition: dragOn ? 'none' : 'transform 200ms ease-out',
  }
  const chromeOpacity = leaving ? 0 : 1 - Math.min(dragMag / 600, 0.7)

  return createPortal(
    <div
      className="viewer-in fixed inset-0 z-[100] flex items-center justify-center bg-black"
      style={{ touchAction: 'none', opacity: chromeOpacity }}
      role="dialog"
      aria-modal="true"
      aria-label={isVideo ? 'Video viewer' : 'Photo viewer'}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={(e) => {
        e.stopPropagation()
        if (justSwiped()) return
        onClose()
      }}
    >
      {sound && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            togglePreview(sound.previewUrl, soundSeg, 'viewer')
          }}
          aria-label={soundPlaying ? 'Mute soundtrack' : 'Play soundtrack'}
          className="absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-xs font-black text-white backdrop-blur-md"
        >
          {soundPlaying ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
          <span className="max-w-[140px] truncate">{sound.title}</span>
        </button>
      )}
      {isVideo ? (
        <span className="relative block h-full w-full" style={{ containerType: 'inline-size' }}>
          <video
            key={item.url}
            ref={vidRef}
            src={item.url}
            poster={item.posterUrl ?? undefined}
            playsInline
            loop={!edit?.trimStart && !edit?.trimEnd}
            preload="auto"
            onClick={(e) => {
              e.stopPropagation()
              handleTap()
            }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              v.volume = edit?.origVolume ?? 1
              if (edit?.speed) v.playbackRate = edit.speed
              if (regionStart > 0 && v.currentTime < regionStart) {
                wrapSeekRef.current = true
                v.currentTime = regionStart
              }
            }}
            onPlay={(e) => {
              if (sound && soundSeg) {
                playSound(sound.previewUrl, soundSeg, Math.max(0, e.currentTarget.currentTime - regionStart), edit?.soundVolume, 'viewer')
              }
            }}
            onPause={() => {
              if (sound && soundSeg && isCurrentSound(sound.previewUrl, soundSeg)) pauseSound('viewer')
            }}
            onSeeked={(e) => {
              // The player's own seeks (loop wrap, restart, open jump)
              // are marked — only a real user scrub resyncs the song,
              // and only while the video is actually playing.
              if (wrapSeekRef.current) {
                wrapSeekRef.current = false
                return
              }
              const v = e.currentTarget
              if (sound && soundSeg && !v.paused && isCurrentSound(sound.previewUrl, soundSeg)) {
                playSound(sound.previewUrl, soundSeg, Math.max(0, v.currentTime - regionStart), edit?.soundVolume, 'viewer')
              }
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              const end = regionEnd(v)
              if (end > regionStart && v.currentTime >= end - 0.02 && !v.paused) {
                wrapSeekRef.current = true
                v.currentTime = regionStart
              }
              const span = Math.max(end - regionStart, 0.01)
              setProgress(Math.min(1, Math.max(0, (v.currentTime - regionStart) / span)))
            }}
            onEnded={(e) => {
              // If the end slips past the region wrap, restart the
              // region and the song together — never one without the other.
              const v = e.currentTarget
              wrapSeekRef.current = true
              v.currentTime = regionStart
              v.play().catch(() => {})
              if (sound && soundSeg && isCurrentSound(sound.previewUrl, soundSeg)) {
                playSound(sound.previewUrl, soundSeg, 0, edit?.soundVolume, 'viewer')
              }
            }}
            onError={() => setFailed(true)}
            style={{ ...mediaStyle, filter: edit?.filterCss || undefined }}
            className="h-full w-full object-contain"
          />
          {(edit?.texts ?? []).map((t) => (
            <span
              key={t.id}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black text-white"
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                ...overlayTextStyle(t, 0),
                fontSize: `${7 * t.scale}cqw`,
              }}
            >
              {t.text}
            </span>
          ))}
        </span>
      ) : (
        <img
          src={hiResArtwork(item.url)}
          alt=""
          onClick={(e) => {
            e.stopPropagation()
            handleTap()
          }}
          style={mediaStyle}
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

      {/* seekable progress bar: drag the knob or tap the bar to scrub */}
      {isVideo && (
        <div
          className="absolute inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div
            ref={barRef}
            className="flex h-8 cursor-pointer items-center px-4"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              setSeeking(true)
              seekToClientX(e.clientX)
            }}
            onPointerMove={(e) => {
              if (seeking) seekToClientX(e.clientX)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              setSeeking(false)
            }}
            onPointerCancel={() => setSeeking(false)}
          >
            <div className="relative h-[3px] w-full rounded-full bg-white/15">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-sig"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sig shadow-[0_1px_6px_rgba(0,0,0,0.6)] transition-[width,height] ${seeking ? 'h-4 w-4' : 'h-3 w-3'}`}
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>
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
