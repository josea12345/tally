import { useEffect, useRef, useState } from 'react'
import { SoundOnIcon, SoundOffIcon } from './MediaViewer'
import type { MediaEdit } from '../lib/types'
import {
  playSound,
  pauseSound,
  isCurrentSound,
  setSoundMuted,
  useSoundState,
  useSoundMuted,
  type SoundSegment,
} from '../lib/sound'

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
      // Only the on-screen clip earns a full buffer. (Never downgrade
      // preload back afterwards — flipping it makes browsers drop
      // buffers, which reads as "stuck" on the way back.)
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
  edit,
  sound = null,
}: {
  src: string
  poster?: string | null
  className?: string
  /** Double-tap handler (e.g. vote W). Single tap still expands, delayed to disambiguate. */
  onDoubleTap?: () => void
  /** Open the in-app fullscreen viewer instead of the native player. */
  onExpand?: () => void
  /** Live-rendered edit (trim / speed / filter / text) from the clip editor. */
  edit?: MediaEdit | null
  /** The drop's soundtrack — incorporated as this video's audio track. */
  sound?: { previewUrl: string; start?: number; end?: number | null } | null
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const tapTimer = useRef<number | null>(null)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)
  // The poster covers the video until it can actually play — starts
  // read as instant instead of a frozen black frame (the IG trick).
  // The player itself stays MOUNTED the whole time: creating and
  // destroying media elements mid-scroll is what makes feeds stick.
  const [ready, setReady] = useState(false)
  // Soundtrack state (incorporated audio): starts/stops with the video.
  const seg: SoundSegment | null = sound
    ? { start: sound.start ?? 0, end: sound.end ?? null }
    : null
  const songPlaying = useSoundState(sound?.previewUrl ?? null, seg)
  const songMuted = useSoundMuted()
  const songPlayingRef = useRef(songPlaying)
  songPlayingRef.current = songPlaying
  const soundRef = useRef(sound)
  soundRef.current = sound
  const segRef = useRef(seg)
  segRef.current = seg
  const stallTimer = useRef<number | null>(null)
  const markReady = () => {
    if (stallTimer.current) {
      clearTimeout(stallTimer.current)
      stallTimer.current = null
    }
    setReady(true)
  }

  useEffect(() => {
    setReady(false)
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
      const s = soundRef.current
      const sg = segRef.current
      if (s && sg && isCurrentSound(s.previewUrl, sg)) pauseSound()
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
    if (seg) {
      // The soundtrack IS this video's audio: the badge starts it
      // (synced to the picture) or mutes it.
      if (!songPlaying) {
        playSound(sound!.previewUrl, seg, Math.max(0, vid.currentTime - trimStart))
        setSoundMuted(false)
      } else {
        setSoundMuted(!songMuted)
      }
      return
    }
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

  const trimStart = edit?.trimStart ?? 0
  const trimEnd = edit?.trimEnd ?? null

  return (
    <div ref={wrapRef} className={`feed-video relative h-full ${className}`} style={{ containerType: 'inline-size' }}>
      <video
        ref={(el) => {
          ref.current = el
          if (el) el.muted = true
        }}
        src={src}
        poster={poster ?? undefined}
        playsInline
        muted
        loop={!(trimStart > 0 || trimEnd != null)}
        preload="metadata"
        onError={() => setFailed(true)}
        onCanPlay={markReady}
        onPlaying={markReady}
        onWaiting={() => {
          // A stall mid-scroll brings the poster back instead of
          // freezing on a frame — reads as "loading", not "stuck".
          if (stallTimer.current) clearTimeout(stallTimer.current)
          stallTimer.current = window.setTimeout(() => setReady(false), 350)
        }}
        onPlay={(e) => {
          if (seg && sound) {
            playSound(sound.previewUrl, seg, Math.max(0, e.currentTarget.currentTime - trimStart))
          }
        }}
        onPause={() => {
          if (seg && sound && isCurrentSound(sound.previewUrl, seg)) pauseSound()
        }}
        onClick={handleTap}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (edit?.speed) v.playbackRate = edit.speed
          if (trimStart > 0 && v.currentTime < trimStart) v.currentTime = trimStart
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (trimEnd != null && v.currentTime >= trimEnd) {
            v.currentTime = trimStart
            if (seg && sound && songPlayingRef.current) playSound(sound.previewUrl, seg, 0)
          }
        }}
        onEnded={(e) => {
          if (trimStart > 0) {
            e.currentTarget.currentTime = trimStart
            e.currentTarget.play().catch(() => {})
            if (seg && sound && songPlayingRef.current) playSound(sound.previewUrl, seg, 0)
          }
        }}
        className="h-full w-full bg-black object-cover"
        style={{ filter: edit?.filterCss || undefined }}
      />
      {poster && (
        <img
          src={poster}
          alt=""
          draggable={false}
          onClick={handleTap}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            ready ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}
      {(edit?.texts ?? []).map((t) => (
        <span
          key={t.id}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black"
          style={{
            left: `${t.x * 100}%`,
            top: `${t.y * 100}%`,
            color: t.color,
            fontSize: `${7 * t.scale}cqw`,
            textShadow: '0 1px 6px rgba(0,0,0,0.85)',
          }}
        >
          {t.text}
        </span>
      ))}
      <button
        onClick={toggleSound}
        aria-label={seg ? (songPlaying && !songMuted ? 'Mute song' : 'Play song') : muted ? 'Unmute' : 'Mute'}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
      >
        {seg ? (
          songPlaying && !songMuted ? (
            <SoundOnIcon className="h-3.5 w-3.5" />
          ) : (
            <SoundOffIcon className="h-3.5 w-3.5" />
          )
        ) : muted ? (
          <SoundOffIcon className="h-3.5 w-3.5" />
        ) : (
          <SoundOnIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}
