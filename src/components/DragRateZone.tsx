import { useRef, useState, type ReactNode } from 'react'
import { PeakMark } from './PeakWordmark'
import { PeakBurst } from './VoteFx'
import { formatScore } from '../lib/ratings'
import { tapHaptic } from '../lib/haptics'

/**
 * Drag-to-rate ON the media itself: wrap a drop's photo/video block and a
 * horizontal drag becomes a rating. The mountain looms in the background
 * of the photo and fills LEFT TO RIGHT with the score; the number rides
 * under it. Release commits the rating — no sheet, no confirm.
 *
 * Gesture discipline (this sits on top of a lot of existing behavior):
 * - The zone is touch-pan-y: vertical gestures stay native page scroll.
 * - A drag only engages after 14px of horizontal-dominant movement, and
 *   only when it started on the upper body of the media — the bottom
 *   strip (action bar, soundtrack pill, video seek controls) never arms
 *   a rating. Taps and double-taps pass through untouched.
 * - After a committed drag, the trailing click is swallowed so it can't
 *   open the viewer / toggle the video / navigate.
 * - On multi-photo posts the horizontal swipe belongs to this gesture
 *   now; the dots under the media still switch photos.
 */
export default function DragRateZone({
  current,
  onRate,
  disabled = false,
  children,
}: {
  current: number | null
  onRate: (score: number) => void
  disabled?: boolean
  children: ReactNode
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ startX: number; startY: number; engaged: boolean; value: number } | null>(null)
  const lastWhole = useRef<number | null>(null)
  const suppressClickUntil = useRef(0)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const [burst, setBurst] = useState(false)

  if (disabled) return <>{children}</>

  const valueFromX = (clientX: number) => {
    const el = zoneRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round(frac * 100) / 10
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return
    gesture.current = { startX: e.clientX, startY: e.clientY, engaged: false, value: valueFromX(e.clientX) }
    lastWhole.current = null
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.engaged) {
      if (Math.abs(dx) < 14 || Math.abs(dx) <= Math.abs(dy)) return
      const el = zoneRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (g.startY - r.top > r.height * 0.78) {
        gesture.current = null
        return
      }
      g.engaged = true
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* capture is best-effort */
      }
    }
    const v = valueFromX(e.clientX)
    g.value = v
    const whole = Math.floor(v)
    if (lastWhole.current !== whole) {
      lastWhole.current = whole
      tapHaptic()
    }
    setDragValue(v)
  }

  const endGesture = (commit: boolean) => {
    const g = gesture.current
    gesture.current = null
    if (g?.engaged) {
      suppressClickUntil.current = Date.now() + 500
      if (commit && g.value !== current) {
        onRate(g.value)
        if (g.value === 10) setBurst(true)
      }
    }
    setDragValue(null)
  }

  return (
    <div
      ref={zoneRef}
      className="relative touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endGesture(true)}
      onPointerCancel={() => endGesture(false)}
      onClickCapture={(e) => {
        if (Date.now() < suppressClickUntil.current) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
    >
      {children}
      {dragValue != null && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-black/30" />
          <span className="relative inline-block">
            <span className="block text-white/35 drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
              <PeakMark className="h-28 w-auto" />
            </span>
            <span className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - dragValue * 10}% 0 0)` }}>
              <span
                className="block text-sig"
                style={
                  dragValue === 10
                    ? { filter: 'drop-shadow(0 0 22px rgba(69,200,255,0.85))' }
                    : undefined
                }
              >
                <PeakMark className="h-28 w-auto" />
              </span>
            </span>
          </span>
          <span className="relative mt-3 text-6xl font-black tabular-nums text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.65)]">
            {formatScore(dragValue)}
          </span>
        </div>
      )}
      {burst && <PeakBurst onDone={() => setBurst(false)} />}
    </div>
  )
}
