import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PHOTO_FILTERS, OVERLAY_COLORS, applyFilterToBlob, type TextOverlay } from '../lib/filters'
import { setPendingUpload } from '../lib/pendingMedia'

/**
 * Full-bleed photo review: the shot fills the screen with a live filter,
 * a filter thumbnail rail at the bottom, retake (X) and Next floating up
 * top — plus text stickers you can drag anywhere, baked in on upload.
 * Used in-place inside the camera AND by the /filter route (native picker).
 */
export default function PhotoReview({
  blob,
  onRetake,
  onDone,
}: {
  blob: Blob
  onRetake: () => void
  onDone: () => void
}) {
  const { user } = useAuth()
  const [filterId, setFilterId] = useState('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [texts, setTexts] = useState<TextOverlay[]>([])
  const [selText, setSelText] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<string | null>(null)

  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const filter = useMemo(
    () => PHOTO_FILTERS.find((f) => f.id === filterId) ?? PHOTO_FILTERS[0]!,
    [filterId]
  )

  const addText = () => {
    const t: TextOverlay = {
      id: crypto.randomUUID(),
      text: 'your text',
      x: 0.5,
      y: 0.42,
      color: OVERLAY_COLORS[0]!,
      scale: 1,
    }
    setTexts((prev) => [...prev, t])
    setSelText(t.id)
  }
  const patchText = (id: string, patch: Partial<TextOverlay>) =>
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const selected = texts.find((t) => t.id === selText) ?? null

  const onOverlayDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    dragRef.current = id
    setSelText(id)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onStageMove = (e: React.PointerEvent) => {
    const id = dragRef.current
    const stage = stageRef.current
    if (!id || !stage) return
    const r = stage.getBoundingClientRect()
    patchText(id, {
      x: Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / Math.max(r.width, 1))),
      y: Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / Math.max(r.height, 1))),
    })
  }

  /**
   * The preview shows the object-cover CROP of the full image, but the
   * upload is the full frame — map sticker positions from the visible
   * crop into full-image coordinates so they land where they were put.
   */
  const bakeTexts = (): { mapped: TextOverlay[]; basis: number } => {
    const img = imgRef.current
    const clean = texts.filter((t) => t.text.trim().length > 0)
    if (!img || clean.length === 0) return { mapped: [], basis: 0 }
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const cw = img.clientWidth
    const ch = img.clientHeight
    if (!iw || !ih || !cw || !ch) return { mapped: clean, basis: ih }
    const s = Math.max(cw / iw, ch / ih)
    const vw = cw / s
    const vh = ch / s
    const x0 = (iw - vw) / 2
    const y0 = (ih - vh) / 2
    return {
      mapped: clean.map((t) => ({ ...t, x: (x0 + t.x * vw) / iw, y: (y0 + t.y * vh) / ih })),
      basis: vh,
    }
  }

  const next = async () => {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      const { mapped, basis } = bakeTexts()
      const filtered = await applyFilterToBlob(blob, filter.css, mapped, basis || undefined)
      const path = `${user.id}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('drop-media')
        .upload(path, filtered, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('drop-media').getPublicUrl(path)
      setPendingUpload({ url: data.publicUrl, type: 'photo' })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen-in absolute inset-0 z-30 flex flex-col bg-black">
      <div
        ref={stageRef}
        className="absolute inset-0"
        onPointerMove={onStageMove}
        onPointerUp={() => (dragRef.current = null)}
      >
        <img
          ref={imgRef}
          src={url}
          alt="Your photo"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: filter.css === 'none' ? undefined : filter.css }}
          draggable={false}
        />
        {texts.map((t) => (
          <span
            key={t.id}
            onPointerDown={(e) => onOverlayDown(e, t.id)}
            className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab whitespace-nowrap font-black text-white ${
              selText === t.id ? 'rounded-lg outline outline-2 outline-sig' : ''
            }`}
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              color: t.color,
              fontSize: `${19 * t.scale}px`,
              textShadow: '0 1px 6px rgba(0,0,0,0.85)',
              touchAction: 'none',
            }}
          >
            {t.text || 'text'}
          </span>
        ))}
      </div>

      {/* top: retake + add-text + next, floating */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          onClick={onRetake}
          aria-label="Retake photo"
          disabled={busy}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button
          onClick={addText}
          disabled={busy}
          className="press rounded-full bg-black/40 px-4 py-2 text-sm font-black text-butter backdrop-blur-sm disabled:opacity-40"
        >
          Aa — Add text
        </button>
        <button
          onClick={next}
          disabled={busy}
          className="press rounded-full bg-sig px-6 py-2.5 text-sm font-black text-ink shadow-[0_4px_20px_rgba(69,200,255,0.4)] disabled:opacity-50"
        >
          {busy ? '…' : 'Next'}
        </button>
      </div>

      {error && (
        <p className="relative z-20 px-6 pt-3 text-center text-xs font-bold text-red-400">{error}</p>
      )}

      {/* selected text editor */}
      {selected && (
        <div className="relative z-20 mx-4 mt-3 rounded-2xl border border-white/15 bg-black/70 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <input
              value={selected.text}
              onChange={(e) => patchText(selected.id, { text: e.target.value.slice(0, 60) })}
              placeholder="Say something"
              autoFocus
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-black/50 px-3.5 py-2 text-sm font-bold text-white outline-none focus:border-sig"
            />
            <button
              onClick={() => {
                setTexts((prev) => prev.filter((t) => t.id !== selected.id))
                setSelText(null)
              }}
              className="shrink-0 rounded-full border border-miss/50 px-3 py-2 text-xs font-black text-miss"
            >
              Delete
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            {OVERLAY_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => patchText(selected.id, { color: c })}
                aria-label={`Text color ${c}`}
                className={`h-7 w-7 rounded-full border-2 ${
                  selected.color === c ? 'border-sig' : 'border-white/25'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <span className="ml-auto flex gap-1">
              {[0.75, 1, 1.4].map((s) => (
                <button
                  key={s}
                  onClick={() => patchText(selected.id, { scale: s })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                    selected.scale === s ? 'bg-sig text-ink' : 'border border-white/25 text-white/70'
                  }`}
                >
                  {s === 0.75 ? 'S' : s === 1 ? 'M' : 'L'}
                </button>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* bottom: filter rail */}
      <div className="relative z-10 mt-auto bg-gradient-to-t from-black/70 to-transparent px-4 pb-10 pt-16">
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {PHOTO_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterId(f.id)}
              className="press flex w-16 shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`h-16 w-16 overflow-hidden rounded-xl border-2 ${
                  f.id === filterId ? 'border-sig' : 'border-transparent'
                }`}
              >
                <img
                  src={url}
                  alt={f.name}
                  className="h-full w-full object-cover"
                  style={{ filter: f.css === 'none' ? undefined : f.css }}
                />
              </span>
              <span
                className={`text-[10px] font-bold ${f.id === filterId ? 'text-sig' : 'text-white/60'}`}
              >
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
