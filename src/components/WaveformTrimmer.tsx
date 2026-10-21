import { useEffect, useRef, useState } from 'react'
import { getSoundSnapshot, playSound, toggleSound, useSoundState } from '../lib/sound'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Real waveform peaks per preview URL, decoded once and cached. */
const peaksCache = new Map<string, number[]>()
const BARS = 72

async function loadPeaks(url: string): Promise<number[] | null> {
  const hit = peaksCache.get(url)
  if (hit) return hit
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const decoded = await ctx.decodeAudioData(buf)
    void ctx.close()
    const ch = decoded.getChannelData(0)
    const peaks: number[] = []
    const per = Math.max(1, Math.floor(ch.length / BARS))
    for (let i = 0; i < BARS; i++) {
      let max = 0
      const start = i * per
      for (let j = start; j < Math.min(ch.length, start + per); j += 16) {
        const v = Math.abs(ch[j] ?? 0)
        if (v > max) max = v
      }
      peaks.push(max)
    }
    const top = Math.max(...peaks, 0.01)
    const norm = peaks.map((p) => Math.max(0.08, p / top))
    peaksCache.set(url, norm)
    return norm
  } catch {
    return null
  }
}

/** Decorative fallback bars (decode blocked): stable per URL. */
function fallbackPeaks(url: string): number[] {
  let h = 0
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0
  const out: number[] = []
  for (let i = 0; i < BARS; i++) {
    h = (h * 1103515245 + 12345) | 0
    out.push(0.25 + ((h >>> 8) % 70) / 100)
  }
  return out
}

/**
 * TikTok-style sound trimmer: the selection window is exactly the
 * clip's length; drag the waveform to choose WHICH part of the song
 * plays. The chosen segment loops in sync with the clip everywhere.
 */
export default function WaveformTrimmer({
  previewUrl,
  clipLength,
  start,
  onChange,
}: {
  previewUrl: string
  /** Length of the (trimmed) video in seconds — the selection size. */
  clipLength: number
  start: number
  /** Reports (start, end) — end is always start + clipLength, clamped. */
  onChange: (start: number, end: number | null) => void
}) {
  const [duration, setDuration] = useState(30)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerX: number; startAtDrag: number } | null>(null)
  const [playhead, setPlayhead] = useState<number | null>(null)

  const winLen = Math.min(clipLength, duration)
  const maxStart = Math.max(0, duration - winLen)
  const clampedStart = Math.min(Math.max(0, start), maxStart)
  const end = clampedStart + winLen >= duration - 0.05 ? null : clampedStart + winLen
  const seg = { start: clampedStart, end }
  const isPlaying = useSoundState(previewUrl, seg)

  // Duration probe (metadata only).
  useEffect(() => {
    const a = new Audio()
    a.preload = 'metadata'
    a.src = previewUrl
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration)
    }
    a.addEventListener('loadedmetadata', onMeta)
    return () => a.removeEventListener('loadedmetadata', onMeta)
  }, [previewUrl])

  useEffect(() => {
    let live = true
    loadPeaks(previewUrl).then((p) => {
      if (live) setPeaks(p ?? fallbackPeaks(previewUrl))
    })
    return () => {
      live = false
    }
  }, [previewUrl])

  // Keep the saved segment glued to the clip length / clamp range.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    onChangeRef.current(clampedStart, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedStart, end])

  // Playhead: poll the shared player while our segment is loaded.
  useEffect(() => {
    if (!isPlaying) {
      setPlayhead(null)
      return
    }
    const t = window.setInterval(() => {
      const snap = getSoundSnapshot()
      if (snap.url === previewUrl) setPlayhead(snap.currentTime)
    }, 100)
    return () => window.clearInterval(t)
  }, [isPlaying, previewUrl])

  const moveWindow = (clientX: number) => {
    const strip = stripRef.current
    const drag = dragRef.current
    if (!strip || !drag) return
    const rect = strip.getBoundingClientRect()
    const dx = ((clientX - drag.pointerX) / rect.width) * duration
    const next = Math.min(maxStart, Math.max(0, drag.startAtDrag + dx))
    onChangeRef.current(Math.round(next * 2) / 2, next + winLen >= duration - 0.05 ? null : Math.round((next + winLen) * 2) / 2)
  }

  const winLeftPct = duration > 0 ? (clampedStart / duration) * 100 : 0
  const winWidthPct = duration > 0 ? (winLen / duration) * 100 : 100
  const playheadPct =
    playhead != null && playhead >= clampedStart && playhead <= clampedStart + winLen
      ? (playhead / duration) * 100
      : null

  return (
    <div className="mt-2 rounded-2xl border border-line bg-ink-2 px-3.5 py-3">
      <div className="flex items-baseline justify-between text-[10px] font-black uppercase tracking-widest text-mute">
        <span>Which part plays</span>
        <span className="tabular-nums normal-case tracking-normal">
          {fmt(clampedStart)} / {fmt(duration)}
        </span>
      </div>

      <div
        ref={stripRef}
        className="relative mt-2.5 h-16 touch-none select-none overflow-hidden rounded-xl bg-ink"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          dragRef.current = { pointerX: e.clientX, startAtDrag: clampedStart }
          moveWindow(e.clientX)
          playSound(previewUrl, seg)
        }}
        onPointerMove={(e) => {
          if (dragRef.current) moveWindow(e.clientX)
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        role="slider"
        aria-label="Song start"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxStart)}
        aria-valuenow={Math.round(clampedStart)}
      >
        {/* waveform */}
        <div className="absolute inset-0 flex items-center gap-[2px] px-1">
          {(peaks ?? fallbackPeaks(previewUrl)).map((p, i) => {
            const t = (i / BARS) * duration
            const inside = t >= clampedStart && t <= clampedStart + winLen
            return (
              <span
                key={i}
                className={`w-full rounded-full ${inside ? 'bg-sig' : 'bg-fog/25'}`}
                style={{ height: `${Math.round(p * 52)}px` }}
              />
            )
          })}
        </div>
        {/* selection window */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-lg border-2 border-fog/90"
          style={{ left: `${winLeftPct}%`, width: `${winWidthPct}%` }}
        />
        {/* playhead */}
        {playheadPct != null && (
          <div
            className="pointer-events-none absolute inset-y-0 w-[2px] bg-butter"
            style={{ left: `${playheadPct}%` }}
          />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-bold text-mute">{Math.round(winLen)}s selected — your clip's length</span>
        <button
          onClick={() => toggleSound(previewUrl, seg)}
          className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
            isPlaying ? 'bg-sig text-ink' : 'border border-line text-fog hover:text-sig'
          }`}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
          {isPlaying ? 'Stop' : 'Preview'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-mute">Drag the waveform — the boxed part plays over your clip, on loop with it.</p>
    </div>
  )
}
