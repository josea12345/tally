import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../lib/video'

const MIN_GAP = 0.5
const THUMB_COUNT = 10

/**
 * TikTok-style trim strip: real frames from the clip, thick handles on
 * both ends, drag the middle to scrub (the playhead position becomes
 * the cover frame). Replaces IN/OUT sliders — you trim what you see.
 */
export default function FilmTrim({
  src,
  duration,
  trimStart,
  trimEnd,
  playhead,
  filterCss,
  onTrim,
  onScrub,
}: {
  src: string
  duration: number
  trimStart: number
  trimEnd: number
  playhead: number
  filterCss?: string
  onTrim: (start: number, end: number) => void
  onScrub: (t: number) => void
}) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const stripRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<'start' | 'end' | 'scrub' | null>(null)

  // Grab real frames off a throwaway element so the strip shows the clip.
  useEffect(() => {
    let live = true
    setThumbs([])
    const vid = document.createElement('video')
    vid.muted = true
    vid.playsInline = true
    vid.preload = 'auto'
    vid.src = src
    const canvas = document.createElement('canvas')
    const grab = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const to = setTimeout(() => reject(new Error('meta timeout')), 6000)
          vid.addEventListener(
            'loadedmetadata',
            () => {
              clearTimeout(to)
              resolve()
            },
            { once: true },
          )
          vid.addEventListener('error', () => reject(new Error('load error')), { once: true })
        })
        const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : duration
        const w = 96
        const h = Math.max(24, Math.round((w * (vid.videoHeight || 16)) / Math.max(vid.videoWidth || 9, 1)))
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const out: string[] = []
        for (let i = 0; i < THUMB_COUNT; i++) {
          const t = Math.min(dur - 0.05, ((i + 0.5) / THUMB_COUNT) * dur)
          await new Promise<void>((resolve) => {
            const to = setTimeout(resolve, 1500)
            vid.addEventListener(
              'seeked',
              () => {
                clearTimeout(to)
                resolve()
              },
              { once: true },
            )
            try {
              vid.currentTime = t
            } catch {
              clearTimeout(to)
              resolve()
            }
          })
          try {
            ctx.drawImage(vid, 0, 0, w, h)
            out.push(canvas.toDataURL('image/jpeg', 0.55))
          } catch {
            /* frame not drawable yet */
          }
          if (!live) return
          setThumbs([...out])
        }
      } catch {
        /* strip still works without thumbnails */
      }
    }
    void grab()
    return () => {
      live = false
      vid.removeAttribute('src')
      vid.load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const timeAt = (clientX: number): number => {
    const el = stripRef.current
    if (!el || duration <= 0) return 0
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(r.width, 1)))
    return frac * duration
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const el = stripRef.current
    if (!el) return
    el.setPointerCapture?.(e.pointerId)
    const t = timeAt(e.clientX)
    const startX = (trimStart / duration) * el.clientWidth
    const endX = (trimEnd / duration) * el.clientWidth
    const x = e.clientX - el.getBoundingClientRect().left
    if (Math.abs(x - startX) <= 18) dragRef.current = 'start'
    else if (Math.abs(x - endX) <= 18) dragRef.current = 'end'
    else {
      dragRef.current = 'scrub'
      onScrub(t)
    }
    if (dragRef.current === 'start') onTrim(Math.min(t, trimEnd - MIN_GAP), trimEnd)
    if (dragRef.current === 'end') onTrim(trimStart, Math.max(t, trimStart + MIN_GAP))
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const mode = dragRef.current
    if (!mode) return
    const t = timeAt(e.clientX)
    if (mode === 'start') onTrim(Math.max(0, Math.min(t, trimEnd - MIN_GAP)), trimEnd)
    else if (mode === 'end') onTrim(trimStart, Math.min(duration, Math.max(t, trimStart + MIN_GAP)))
    else onScrub(Math.min(Math.max(t, trimStart), trimEnd))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100
  const headPct = duration > 0 ? (Math.min(Math.max(playhead, 0), duration) / duration) * 100 : 0
  const headInRange = playhead >= trimStart - 0.01 && playhead <= trimEnd + 0.01

  return (
    <div>
      <div
        ref={stripRef}
        className="relative h-16 touch-none select-none overflow-hidden rounded-xl bg-ink"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        aria-label="Trim the clip"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(trimStart)}
      >
        {/* frames */}
        <div className="absolute inset-0 flex">
          {thumbs.length > 0
            ? thumbs.map((t, i) => (
                <img
                  key={i}
                  src={t}
                  alt=""
                  draggable={false}
                  className="h-full min-w-0 flex-1 object-cover"
                  style={filterCss && filterCss !== 'none' ? { filter: filterCss } : undefined}
                />
              ))
            : Array.from({ length: THUMB_COUNT }).map((_, i) => (
                <span key={i} className="h-full min-w-0 flex-1 animate-pulse bg-ink-3" />
              ))}
        </div>
        {/* dimmed-out regions */}
        <div className="absolute inset-y-0 left-0 bg-black/70" style={{ width: `${startPct}%` }} />
        <div className="absolute inset-y-0 right-0 bg-black/70" style={{ width: `${100 - endPct}%` }} />
        {/* selection frame + handles */}
        <div
          className="pointer-events-none absolute inset-y-0 border-y-[3px] border-fog"
          style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 flex w-3.5 items-center justify-center rounded-l-md bg-fog"
          style={{ left: `calc(${startPct}% - 14px)` }}
        >
          <span className="h-6 w-[3px] rounded bg-ink/50" />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 flex w-3.5 items-center justify-center rounded-r-md bg-fog"
          style={{ left: `${endPct}%` }}
        >
          <span className="h-6 w-[3px] rounded bg-ink/50" />
        </div>
        {/* playhead */}
        <div
          className={`pointer-events-none absolute inset-y-0 w-[2.5px] bg-white shadow-[0_0_6px_rgba(0,0,0,0.9)] ${
            headInRange ? '' : 'opacity-50'
          }`}
          style={{ left: `${headPct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold tabular-nums text-mute">
        <span>{formatDuration(trimStart)}</span>
        <span className="text-fog">{formatDuration(trimEnd - trimStart)} selected</span>
        <span>{formatDuration(trimEnd)}</span>
      </div>
    </div>
  )
}
