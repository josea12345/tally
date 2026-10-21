import { useEffect, useState } from 'react'

/** Which part of a preview plays: [start, end) seconds. end null = track end. */
export interface SoundSegment {
  start: number
  end: number | null
}

/**
 * One shared <audio> for drop soundtracks — only one preview plays at
 * a time app-wide, optionally looping just the chosen segment of it.
 * Components subscribe to (key, playing) changes via useSoundState.
 */
let audio: HTMLAudioElement | null = null
let currentUrl: string | null = null
let segment: SoundSegment | null = null
let playing = false
const listeners = new Set<() => void>()

function keyFor(url: string, seg?: SoundSegment | null): string {
  return `${url}|${seg?.start ?? 0}|${seg?.end ?? ''}`
}
let currentKey = ''

function emit() {
  for (const fn of listeners) fn()
}

function seekToStart() {
  if (!audio || !segment) return
  const start = segment.start
  if (audio.readyState >= 1) {
    try {
      audio.currentTime = start
    } catch {
      /* not seekable yet — the loadedmetadata path covers it */
    }
  } else {
    const onMeta = () => {
      if (audio && segment && segment.start === start) {
        try {
          audio.currentTime = start
        } catch {
          /* ignore */
        }
      }
    }
    audio.addEventListener('loadedmetadata', onMeta, { once: true })
  }
}

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
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
        // Loop just the chosen part of the song.
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
  }
  return audio
}

export function playSound(url: string, seg?: SoundSegment | null) {
  const a = ensure()
  const key = keyFor(url, seg)
  if (currentKey !== key) {
    currentKey = key
    segment = seg ?? null
    // Whole-track playback loops natively; segment looping is manual.
    a.loop = !segment || segment.end == null ? true : false
    if (segment && segment.end == null && segment.start > 0) a.loop = false
    if (currentUrl !== url) {
      currentUrl = url
      a.src = url
    }
    seekToStart()
  }
  if (a.paused) a.play().catch(() => {})
  emit()
}

export function toggleSound(url: string, seg?: SoundSegment | null) {
  const a = ensure()
  if (currentKey === keyFor(url, seg) && !a.paused) {
    a.pause()
    return
  }
  playSound(url, seg)
}

export function stopSound() {
  if (audio && !audio.paused) audio.pause()
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
