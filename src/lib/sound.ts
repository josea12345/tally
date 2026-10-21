import { useEffect, useState } from 'react'

/** Which part of a preview plays: [start, end) seconds. end null = track end. */
export interface SoundSegment {
  start: number
  end: number | null
}

/**
 * One shared <audio> for drop soundtracks — it behaves as the playing
 * video's audio track: FeedVideo/MediaViewer start and pause it in
 * sync with their <video> (offset-mapped into the chosen segment).
 *
 * Autoplay reality: browsers only let an <audio> element make sound
 * after a user gesture, so the first pointerdown anywhere "unlocks"
 * the element with a silent play; after that, programmatic play in
 * sync with scrolling videos works for the session.
 */
let audio: HTMLAudioElement | null = null
let currentUrl: string | null = null
let segment: SoundSegment | null = null
let playing = false
let mutedFlag = false
let volumeLevel = 1
/**
 * Exclusive driver: while an owner is claimed (the fullscreen viewer,
 * the editor), sound calls from anyone else are ignored — a feed video
 * still playing under an overlay must not restart the song mid-play.
 */
let soundOwner: string | null = null

export function claimSound(owner: string) {
  soundOwner = owner
}

export function releaseSound(owner: string) {
  if (soundOwner === owner) soundOwner = null
}

function mayDrive(owner?: string): boolean {
  return soundOwner == null || owner === soundOwner
}
let unlocked = false
const listeners = new Set<() => void>()

function keyFor(url: string, seg?: SoundSegment | null): string {
  return `${url}|${seg?.start ?? 0}|${seg?.end ?? ''}`
}
let currentKey = ''

function emit() {
  for (const fn of listeners) fn()
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

function seekTo(pos: number) {
  if (!audio) return
  const apply = () => {
    try {
      if (audio) audio.currentTime = pos
    } catch {
      /* ignore */
    }
  }
  if (audio.readyState >= 1) apply()
  else audio.addEventListener('loadedmetadata', apply, { once: true })
}

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.volume = volumeLevel
    audio.addEventListener('play', () => {
      playing = true
      emit()
    })
    audio.addEventListener('pause', () => {
      playing = false
      emit()
    })
    audio.addEventListener('ended', () => {
      // A segment with only a start offset loops back to its start.
      if (audio && segment && segment.end == null && segment.start > 0) {
        try {
          audio.currentTime = segment.start
        } catch {
          /* ignore */
        }
        audio.play().catch(() => {})
        return
      }
      playing = false
      emit()
    })
    audio.addEventListener('timeupdate', () => {
      if (!audio || !segment) return
      if (segment.end != null && audio.currentTime >= segment.end) {
        try {
          audio.currentTime = segment.start
        } catch {
          /* ignore */
        }
      } else if (audio.currentTime < segment.start - 0.3) {
        try {
          audio.currentTime = segment.start
        } catch {
          /* ignore */
        }
      }
    })
    // One-time unlock on the first tap anywhere in the app.
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock)
      if (unlocked || !audio) return
      const a = audio
      const prevSrc = a.src
      a.muted = true
      a.src = SILENT_WAV
      a.play()
        .then(() => {
          a.pause()
          a.muted = mutedFlag
          unlocked = true
          if (prevSrc) a.src = prevSrc
          else a.removeAttribute('src')
        })
        .catch(() => {
          a.muted = mutedFlag
        })
    }
    window.addEventListener('pointerdown', unlock)
  }
  return audio
}

/** Segment length in seconds (preview tracks run ~30s). */
export function segmentLength(seg: SoundSegment | null, fallback = 30): number {
  if (!seg) return fallback
  return seg.end != null ? Math.max(1, seg.end - seg.start) : fallback
}

/** Where in the track a video at `videoTime` should hear: mapped into the segment, looping. */
export function segmentPosition(seg: SoundSegment | null, videoTime: number): number {
  if (!seg) return 0
  const len = segmentLength(seg)
  return seg.start + (Math.max(0, videoTime) % len)
}

export function playSound(url: string, seg?: SoundSegment | null, offsetSec = -1, volume?: number, owner?: string) {
  if (!mayDrive(owner)) return
  const a = ensure()
  if (volume != null) setSoundVolume(volume)
  const key = keyFor(url, seg)
  const fresh = currentKey !== key
  if (fresh) {
    currentKey = key
    segment = seg ?? null
    a.loop = !segment || (segment.end == null && segment.start === 0)
    if (currentUrl !== url) {
      currentUrl = url
      a.src = url
    }
  }
  // Seek on a fresh load, or whenever the caller passes an explicit
  // video-synced offset; a plain resume (offset -1) stays in place.
  if (fresh) seekTo(segmentPosition(seg ?? null, Math.max(0, offsetSec)))
  else if (offsetSec >= 0) seekTo(segmentPosition(seg ?? null, offsetSec))
  if (a.paused) a.play().catch(() => {})
  emit()
}

export function pauseSound(owner?: string) {
  if (!mayDrive(owner)) return
  if (audio && !audio.paused) audio.pause()
}

export function toggleSound(url: string, seg?: SoundSegment | null, owner?: string) {
  if (!mayDrive(owner)) return
  const a = ensure()
  if (currentKey === keyFor(url, seg) && !a.paused) {
    a.pause()
    return
  }
  playSound(url, seg, -1, undefined, owner)
}

export function stopSound(owner?: string) {
  pauseSound(owner)
}

/** True when this exact song+segment is the one loaded in the player. */
export function isCurrentSound(url: string, seg?: SoundSegment | null): boolean {
  return currentKey === keyFor(url, seg)
}

export function setSoundMuted(m: boolean) {
  mutedFlag = m
  if (audio) audio.muted = m
  emit()
}

/** Soundtrack gain (0..1) — the "Added sound" side of the volume mix. */
export function setSoundVolume(v: number) {
  volumeLevel = Math.max(0, Math.min(1, v))
  if (audio) audio.volume = volumeLevel
}

export function getSoundVolume(): number {
  return volumeLevel
}

export function useSoundState(url: string | null, seg?: SoundSegment | null): boolean {
  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return !!url && currentKey === keyFor(url, seg) && playing
}

export function useSoundMuted(): boolean {  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return mutedFlag
}

/** Imperative snapshot for UI that polls (waveform playheads). */
export function getSoundSnapshot(): {
  url: string | null
  playing: boolean
  currentTime: number
  segment: SoundSegment | null
} {
  return {
    url: currentUrl,
    playing,
    currentTime: audio?.currentTime ?? 0,
    segment,
  }
}
