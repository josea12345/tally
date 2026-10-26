import { useEffect, useRef, useState } from 'react'
import { parseScoreInput, formatScore } from '../lib/ratings'
import { PeakMark } from './PeakWordmark'
import { PeakBurst } from './VoteFx'
import { tapHaptic } from '../lib/haptics'

interface RateSheetProps {
  /** The drop being rated (title shown in the sheet header). */
  title: string
  /** My current rating on this drop, if any. */
  current: number | null
  /** Value pre-loaded into the field (double-tap loads 10). */
  prefill?: number | null
  /** The one allowed change is spent — the sheet explains, no editing. */
  locked?: boolean
  onRate: (score: number) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * The rating ritual: a scorecard, not a form. Drag the mountain — the
 * fill climbs with your score — or type it: the number is huge, and a
 * 10 lights the whole peak. One confirm puts it on the record.
 */
export default function RateSheet({ title, current, prefill, locked = false, onRate, onRemove, onClose }: RateSheetProps) {
  const [text, setText] = useState(() =>
    prefill != null ? formatScore(prefill) : current != null ? formatScore(current) : '',
  )
  const [burst, setBurst] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const lastWhole = useRef<number | null>(null)
  const parsed = parseScoreInput(text)
  const isTen = parsed === 10
  const fillPct = parsed != null ? parsed * 10 : 0

  /** Touch-and-drag on the mountain: top of the zone is 10, bottom is 0. */
  const scoreFromY = (clientY: number) => {
    const el = zoneRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height))
    const v = Math.round(frac * 100) / 10
    const whole = Math.floor(v)
    if (lastWhole.current !== whole) {
      lastWhole.current = whole
      tapHaptic()
    }
    setText(formatScore(v))
  }

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = () => {
    if (parsed == null) return
    tapHaptic()
    onRate(parsed)
    if (parsed === 10) {
      setBurst(true)
      setTimeout(onClose, 780)
    } else {
      onClose()
    }
  }

  if (locked && current != null) {
    return (
      <div className="fixed inset-0 z-[130]" role="dialog" aria-modal="true" aria-label={`Rate ${title}`}>
        <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        <div className="animate-[pop-in_.25s_ease-out] absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-[26px] border-t border-line bg-ink-2 px-5 pb-10 pt-3 shadow-2xl">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
          <p className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-mute">Your call on</p>
          <p className="mt-1 truncate text-center text-base font-bold">{title}</p>
          <p className="mt-5 text-center text-xl font-black text-fog">
            Locked at {formatScore(current)}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-center text-sm text-mute">
            You already used your one change on this one — ratings lock after that.
          </p>
          <button
            onClick={onClose}
            className="press mt-5 w-full rounded-full bg-sig py-3.5 text-base font-black text-ink"
          >
            Got it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[130]" role="dialog" aria-modal="true" aria-label={`Rate ${title}`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="animate-[pop-in_.25s_ease-out] absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-[26px] border-t border-line bg-ink-2 px-5 pb-10 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <p className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-mute">Your call on</p>
        <p className="mt-1 truncate text-center text-base font-bold">{title}</p>

        <div
          ref={zoneRef}
          role="slider"
          aria-label="Drag to set your score"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={parsed ?? undefined}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
              e.preventDefault()
              setText(formatScore(Math.min(10, Math.round(((parsed ?? 0) + 0.1) * 10) / 10)))
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
              e.preventDefault()
              setText(formatScore(Math.max(0, Math.round(((parsed ?? 0) - 0.1) * 10) / 10)))
            }
          }}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            scoreFromY(e.clientY)
          }}
          onPointerMove={(e) => {
            if (dragging.current) scoreFromY(e.clientY)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
          className="mt-3 flex h-40 cursor-grab touch-none select-none items-center justify-center outline-none active:cursor-grabbing"
        >
          <span className="relative inline-block">
            <span className="text-mute/25">
              <PeakMark className="h-20 w-auto" />
            </span>
            <span
              className="absolute inset-0"
              style={{ clipPath: `inset(${100 - fillPct}% 0px 0px 0px)` }}
            >
              <span
                className="block text-sig"
                style={isTen ? { filter: 'drop-shadow(0 0 18px rgba(69,200,255,0.55))' } : undefined}
              >
                <PeakMark className="h-20 w-auto" />
              </span>
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-end justify-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="8.3"
            aria-label="Your score, 0 to 10"
            className={`w-44 border-b-[3px] bg-transparent pb-1 text-center text-[56px] font-black leading-none outline-none transition-colors placeholder:text-mute/30 ${
              isTen ? 'border-sig text-sig' : parsed != null ? 'border-fog/60' : 'border-line'
            }`}
          />
        </div>

        <p className={`mt-3 h-5 text-center text-sm font-bold ${isTen ? 'text-sig' : 'text-mute'}`}>
          {isTen
            ? "That's a peak."
            : parsed != null
              ? `On the record as ${formatScore(parsed)}`
              : text.trim()
                ? 'Scores run 0 to 10 — decimals welcome'
                : 'Drag the mountain — or type your score'}
        </p>

        <button
          onClick={submit}
          disabled={parsed == null || parsed === current}
          className="press mt-4 w-full rounded-full bg-sig py-3.5 text-base font-black text-ink disabled:opacity-40"
        >
          Put it on the record
        </button>
        {current != null && (
          <button
            onClick={() => {
              onRemove()
              onClose()
            }}
            className="press mx-auto mt-3 block text-sm font-bold text-miss"
          >
            Remove my rating
          </button>
        )}
      </div>
      {burst && <PeakBurst onDone={() => setBurst(false)} />}
    </div>
  )
}

/**
 * The inline typed-score field used where a score is part of a bigger form
 * (the author's call in the composer). Same parsing as the sheet: type
 * "83" and it means 8.3; a 10 lights the mountain.
 */
export function ScoreField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: number | null
  onChange: (v: number | null) => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState(() => (value != null ? formatScore(value) : ''))
  useEffect(() => {
    if (value !== parseScoreInput(text)) {
      setText(value != null ? formatScore(value) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const isTen = value === 10
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={isTen ? 'text-sig' : 'text-mute/50'}>
        <PeakMark className="h-5 w-auto" />
      </span>
      <input
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseScoreInput(e.target.value))
        }}
        inputMode="decimal"
        enterKeyHint="done"
        placeholder="8.3"
        aria-label="Score, 0 to 10"
        className={`w-24 rounded-xl border bg-ink-3 px-3 py-2.5 text-center text-xl font-black outline-none placeholder:text-mute/30 ${
          isTen ? 'border-sig/60 text-sig' : 'border-line'
        }`}
      />
      {isTen && <span className="text-xs font-black uppercase tracking-wider text-sig">Peak</span>}
    </span>
  )
}
