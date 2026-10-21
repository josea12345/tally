import { useEffect, useState } from 'react'

/**
 * One shared <audio> for drop soundtracks — only one preview plays at
 * a time app-wide. Components subscribe to (url, playing) changes.
 */
let audio: HTMLAudioElement | null = null
let currentUrl: string | null = null
let playing = false
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.loop = true
    audio.addEventListener('play', () => {
      playing = true
      emit()
    })
    audio.addEventListener('pause', () => {
      playing = false
      emit()
    })
    audio.addEventListener('ended', () => {
      playing = false
      emit()
    })
  }
  return audio
}

export function toggleSound(url: string) {
  const a = ensure()
  if (currentUrl === url && !a.paused) {
    a.pause()
    return
  }
  if (currentUrl !== url) {
    currentUrl = url
    a.src = url
  }
  a.play().catch(() => {})
  emit()
}

export function playSound(url: string) {
  const a = ensure()
  if (currentUrl !== url) {
    currentUrl = url
    a.src = url
  }
  if (a.paused) a.play().catch(() => {})
  emit()
}

export function stopSound() {
  if (audio && !audio.paused) audio.pause()
}

export function useSoundState(url: string | null): boolean {
  // Subscribe via a state counter — small helper kept framework-light.
  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return !!url && currentUrl === url && playing
}
