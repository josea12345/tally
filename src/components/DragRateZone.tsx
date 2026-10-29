import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PeakMark } from './PeakWordmark'
import { PeakBurst } from './VoteFx'
import { formatScore } from '../lib/ratings'
import { tapHaptic, successHaptic, peakHaptic } from '../lib/haptics'

/**
 * Rate ON the media itself: PRESS AND HOLD the photo, then drag bottom to
 * top. The mountain looms in the background of the photo and fills from
 * the bottom up as the score climbs; the number rides under it. Release
 * commits the rating — no sheet, no confirm.
 *
 * Gesture discipline (this sits on top of a lot of existing behavior):
 * - Arming takes a ~220ms hold. Any real movement (>10px) before that
 *   cancels the arm, so page scrolling, carousel swipes, taps and
 *   double-taps all behave exactly as before — the multi-photo swipe
 *   keeps working because a swipe never holds still.
 * - Drags that start on the bottom strip (action bar, soundtrack pill,
 *   video controls) never arm.
 * - Sensitivity: after arming, the score moves at 1.5× the finger's
 *   travel, so a short drag up sweeps the range.
 * - Once armed, a non-passive touchmove listener blocks page scroll for
 *   the rest of the gesture (touch-action alone can't — it's decided
 *   when the touch starts), and the click after a committed drag is
 *   swallowed so it can't open the viewer / toggle the video.
 * - The climb: as the fill rises bottom to top, the mountain EXPANDS,
 *   brightens and glows harder — a continuous ramp on the score, not a
 *   switch. At 8+ a pulsing halo joins in and the number turns sig and
 *   pops per whole number. Tier crossings carry their own haptics
 *   (double-tap into the zone, the full peak pattern at 10), and
 *   committing an 8+ confirms with a buzz.
 */
const HOLD_MS = 220
const SLOP_PX = 10
const GAIN = 1.5

export default function DragRateZone({
  current,
  onRate,
  disabled = false,
  changeSpent = false,
  showHint = false,
  onDragCommit,
  frameClassName,
  children,
}: {
  current: number | null
  onRate: (score: number) => void
  disabled?: boolean
  /** The one allowed change is spent — the hold explains the lock. */
  changeSpent?: boolean
  /** Show the "Press & hold to rate" pill (until the first drag-rate). */
  showHint?: boolean
  /** Fired when a rating actually commits through the drag path. */
  onDragCommit?: () => void
  /** Extra classes for the drag overlay (e.g. the arch radii) so the
   *  dim follows the media frame instead of covering its corners. */
  frameClassName?: string
  children: ReactNode
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastY: number
    armed: boolean
    anchorY: number
    anchorValue: number
    value: number
  } | null>(null)
  const holdTimer = useRef<number | null>(null)
  const armedRef = useRef(false)
  const lastWhole = useRef<number | null>(null)
  const lastTier = useRef(0)
  const suppressClickUntil = useRef(0)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const [burst, setBurst] = useState(false)
  // Layer-2 teaching: a finger RESTING on the photo (past ~130ms,
  // before the 220ms arm) fades in a faint mountain — the surface
  // answers back before the gesture even starts. Scrolls cancel it:
  // they move past the slop limit long before the timer lands.
  const [resting, setResting] = useState(false)
  const restTimer = useRef<number | null>(null)
  const clearRest = () => {
    if (restTimer.current) {
      window.clearTimeout(restTimer.current)
      restTimer.current = null
    }
    setResting(false)
  }
  // Re-rate guard (Jose's ask, 2026-10-26): once you've rated a drop,
  // a press-and-hold asks before it can change anything — a stray
  // touch-and-slide shouldn't silently rewrite a rating. Confirming
  // once unlocks re-rating for as long as this card stays mounted.
  const [confirmModify, setConfirmModify] = useState(false)
  const [lockedNotice, setLockedNotice] = useState(false)
  const modifyOk = useRef(false)

  // Block page scroll mid-gesture once armed (see the doc comment).
  useEffect(() => {
    const el = zoneRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (armedRef.current) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('touchmove', onTouchMove)
      if (holdTimer.current) window.clearTimeout(holdTimer.current)
    }
  }, [])

  if (disabled) return <>{children}</>

  const valueFromY = (clientY: number) => {
    const el = zoneRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height))
    return Math.round(frac * 100) / 10
  }

  const cancelHold = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  const arm = () => {
    const g = gesture.current
    if (!g || g.armed) return
    if (current != null && !modifyOk.current) {
      // Already rated: end the gesture quietly and ask first — or, when
      // the one change is spent, explain that the rating is locked.
      gesture.current = null
      cancelHold()
      if (changeSpent) setLockedNotice(true)
      else setConfirmModify(true)
      return
    }
    g.armed = true
    armedRef.current = true
    g.anchorY = g.lastY
    g.anchorValue = valueFromY(g.lastY)
    g.value = g.anchorValue
    lastTier.current = g.anchorValue >= 10 ? 2 : g.anchorValue >= 8 ? 1 : 0
    lastWhole.current = Math.floor(g.anchorValue)
    tapHaptic()
    setDragValue(g.anchorValue)
    try {
      zoneRef.current?.setPointerCapture(g.pointerId)
    } catch {
      /* capture is best-effort */
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return
    // Bottom strip never arms: action bar, soundtrack pill, video controls.
    const el = zoneRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (e.clientY - r.top > r.height * 0.85) return
    }
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      armed: false,
      anchorY: e.clientY,
      anchorValue: 0,
      value: 0,
    }
    cancelHold()
    holdTimer.current = window.setTimeout(arm, HOLD_MS)
    if (restTimer.current) window.clearTimeout(restTimer.current)
    restTimer.current = window.setTimeout(() => {
      if (gesture.current && !gesture.current.armed) setResting(true)
    }, 130)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    g.lastY = e.clientY
    if (!g.armed) {
      // Moved before the hold landed → this is a scroll / swipe / seek.
      if (Math.abs(e.clientX - g.startX) > SLOP_PX || Math.abs(e.clientY - g.startY) > SLOP_PX) {
        cancelHold()
        clearRest()
        gesture.current = null
      }
      return
    }
    const el = zoneRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const traveled = ((g.anchorY - e.clientY) / r.height) * 10 * GAIN
    const v = Math.round(Math.min(10, Math.max(0, g.anchorValue + traveled)) * 10) / 10
    g.value = v
    // Tier crossings get their own buzz — entering the glow zone lands a
    // double-tap, reaching a 10 the full peak pattern. Plain whole-number
    // ticks continue underneath.
    const tierNow = v >= 10 ? 2 : v >= 8 ? 1 : 0
    const whole = Math.floor(v)
    if (tierNow > lastTier.current) {
      if (tierNow === 2) peakHaptic()
      else successHaptic()
    } else if (lastWhole.current !== whole) {
      tapHaptic()
    }
    lastTier.current = tierNow
    lastWhole.current = whole
    setDragValue(v)
  }

  const endGesture = (commit: boolean) => {
    cancelHold()
    clearRest()
    const g = gesture.current
    gesture.current = null
    const wasArmed = !!g?.armed
    armedRef.current = false
    if (wasArmed && g) {
      suppressClickUntil.current = Date.now() + 500
      if (commit && g.value !== current) {
        onRate(g.value)
        onDragCommit?.()
        if (g.value === 10) {
          setBurst(true)
          peakHaptic()
        } else if (g.value >= 8) {
          successHaptic()
        }
      }
    }
    setDragValue(null)
  }

  const tier = dragValue == null ? 0 : dragValue >= 10 ? 2 : dragValue >= 8 ? 1 : 0
  const frac = dragValue == null ? 0 : dragValue / 10

  return (
    <div
      ref={zoneRef}
      className="relative touch-pan-y select-none [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
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
      {showHint && current == null && dragValue == null && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
          <div className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
            <span className="relative inline-block">
              <PeakMark className="h-4 w-auto text-white/40" />
              <span
                className="absolute inset-0"
                style={{ animation: 'hint-fill 2.2s ease-in-out infinite' }}
              >
                <PeakMark className="h-4 w-auto text-sig" />
              </span>
            </span>
            <span className="whitespace-nowrap text-[11px] font-black tracking-wide text-white">
              Press &amp; hold to rate
            </span>
          </div>
        </div>
      )}
      {resting && dragValue == null && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="animate-[viewer-in_.18s_ease-out] text-white/30 drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
            <PeakMark className="h-20 w-auto" />
          </span>
        </div>
      )}
      {dragValue != null && (
        <div className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden ${frameClassName ?? ''}`}>
          <div className="absolute inset-0 bg-black/30" />
          {tier === 2 && <div className="absolute inset-0 bg-sig/10" />}
          <span
            className="relative inline-block transition-transform duration-75 ease-linear"
            style={{ transform: `scale(${(0.82 + frac * 0.38).toFixed(3)})` }}
          >
            {tier >= 1 && (
              <span
                className="absolute -inset-8 rounded-full bg-sig/50 blur-2xl"
                style={{ animation: 'glow-pulse 1.1s ease-in-out infinite' }}
              />
            )}
            <span className="relative block text-white/35 drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
              <PeakMark className="h-28 w-auto" />
            </span>
            <span
              className="absolute inset-0"
              style={{ clipPath: `inset(${100 - dragValue * 10}% 0 0 0)` }}
            >
              <span
                className="block text-sig"
                style={{
                  filter: `brightness(${(0.55 + frac * 0.65).toFixed(2)}) drop-shadow(0 0 ${Math.round(frac * 30)}px rgba(69,200,255,${(frac * 0.95).toFixed(2)}))`,
                }}
              >
                <PeakMark className="h-28 w-auto" />
              </span>
            </span>
          </span>
          <span
            key={Math.floor(dragValue)}
            className={`pop-in relative mt-3 text-6xl font-black tabular-nums drop-shadow-[0_2px_14px_rgba(0,0,0,0.65)] ${
              tier >= 1 ? 'text-sig' : 'text-white'
            }`}
          >
            {formatScore(dragValue)}
          </span>
        </div>
      )}
      {burst && <PeakBurst onDone={() => setBurst(false)} />}
      {lockedNotice && current != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setLockedNotice(false)}
        >
          <div
            className="pop-in w-full max-w-xs rounded-3xl border border-line bg-ink-2 p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mb-2 inline-block text-sig">
              <PeakMark className="h-8 w-auto" />
            </span>
            <p className="text-base font-black text-fog">This rating is locked</p>
            <p className="mt-1 text-sm text-mute">
              You rated it {formatScore(current)} and already used your one change.
            </p>
            <button
              onClick={() => setLockedNotice(false)}
              className="btn-pop press mt-4 w-full rounded-full px-4 py-2.5 text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {confirmModify && current != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setConfirmModify(false)}
        >
          <div
            className="pop-in w-full max-w-xs rounded-3xl border border-line bg-ink-2 p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mb-2 inline-block text-sig">
              <PeakMark className="h-8 w-auto" />
            </span>
            <p className="text-base font-black text-fog">
              You rated this {formatScore(current)}
            </p>
            <p className="mt-1 text-sm text-mute">
              Want to change your rating? You get one change per post.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmModify(false)}
                className="press flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-black text-fog"
              >
                Keep it
              </button>
              <button
                onClick={() => {
                  modifyOk.current = true
                  setConfirmModify(false)
                  tapHaptic()
                }}
                className="btn-pop press flex-1 rounded-full px-4 py-2.5 text-sm"
              >
                Change rating
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
