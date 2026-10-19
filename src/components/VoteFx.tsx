import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import TallyIcon from './TallyIcon'

/** Full-screen verdict slam: a giant W or L bursts over the whole screen. */
export function VerdictBurst({ v, onDone }: { v: 'W' | 'L'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 950)
    return () => clearTimeout(t)
  }, [onDone])
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <div className="verdict-burst-bg absolute inset-0 bg-black/35" />
      <span
        className={`verdict-burst relative font-black leading-none ${v === 'W' ? 'text-win' : 'text-miss'}`}
        style={{
          fontSize: 'min(44vw, 26rem)',
          filter:
            v === 'W'
              ? 'drop-shadow(0 0 60px rgba(105,231,207,0.45))'
              : 'drop-shadow(0 0 60px rgba(255,93,110,0.45))',
        }}
      >
        {v}
      </span>
    </div>,
    document.body
  )
}

/** Fly-to-tab: the tally icon arcs from the tapped button into the Tallies nav tab. */
export function FlyToTally({ from, onDone }: { from: DOMRect; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) {
      onDone()
      return
    }
    const tabs = Array.from(document.querySelectorAll('[data-nav-tab="saved"]'))
    const target = tabs.find((t) => {
      const r = t.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (!target) {
      onDone()
      return
    }
    const tr = target.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2
    const toX = tr.left + tr.width / 2
    const toY = tr.top + tr.height / 2
    const midX = (fromX + toX) / 2
    const midY = Math.min(fromY, toY) - 70
    const S = 14 // half of the h-7 icon
    const anim = el.animate(
      [
        { transform: `translate(${fromX - S}px, ${fromY - S}px) scale(1)`, opacity: 1 },
        { transform: `translate(${midX - S}px, ${midY - S}px) scale(0.85)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${toX - S}px, ${toY - S}px) scale(0.25)`, opacity: 0.6 },
      ],
      { duration: 650, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' }
    )
    anim.onfinish = () => {
      target.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' }
      )
      onDone()
    }
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-[200]">
      <TallyIcon saved className="h-7 w-7 text-sig drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]" />
    </div>,
    document.body
  )
}
