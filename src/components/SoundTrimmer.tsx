import { useEffect, useState } from 'react'
import { toggleSound, useSoundState } from '../lib/sound'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Pick which part of a song's preview plays over the video: IN/OUT
 * sliders over the preview track, with a live segment preview.
 */
export default function SoundTrimmer({
  previewUrl,
  start,
  end,
  onChange,
}: {
  previewUrl: string
  start: number
  end: number | null
  onChange: (start: number, end: number | null) => void
}) {
  const [duration, setDuration] = useState(30)
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

  const effEnd = end ?? duration
  const isPlaying = useSoundState(previewUrl, { start, end })

  return (
    <div className="mt-2 rounded-2xl border border-line bg-ink-2 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-mute">
          Which part plays
        </span>
        <span className="text-xs font-black text-sig tabular-nums">
          {fmt(start)} – {fmt(effEnd)} · {Math.max(0, effEnd - start).toFixed(0)}s
        </span>
      </div>
      <label className="mt-2.5 flex items-center gap-2.5">
        <span className="w-8 shrink-0 text-[10px] font-black uppercase text-mute">Start</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, duration - 1)}
          step={0.5}
          value={start}
          onChange={(e) => {
            const v = Number(e.target.value)
            onChange(v, end != null && end <= v + 0.5 ? null : end)
          }}
          className="min-w-0 flex-1 accent-[#45C8FF]"
          aria-label="Song start"
        />
      </label>
      <label className="mt-1.5 flex items-center gap-2.5">
        <span className="w-8 shrink-0 text-[10px] font-black uppercase text-mute">End</span>
        <input
          type="range"
          min={Math.min(duration, start + 1)}
          max={duration}
          step={0.5}
          value={effEnd}
          onChange={(e) => {
            const v = Number(e.target.value)
            onChange(start, v >= duration ? null : v)
          }}
          className="min-w-0 flex-1 accent-[#45C8FF]"
          aria-label="Song end"
        />
      </label>
      <button
        onClick={() => toggleSound(previewUrl, { start, end })}
        className={`mt-2.5 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
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
        {isPlaying ? 'Stop preview' : 'Preview this part'}
      </button>
    </div>
  )
}
