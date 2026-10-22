import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IMMUTABLE_CACHE_CONTROL } from '../lib/media'
import { MAX_CAROUSEL_ITEMS } from '../lib/types'
import { prepareImageForUpload } from '../lib/image'

const MAX_BYTES = 20 * 1024 * 1024
const PITCH = 104 // thumbnail width (96px) + gap (8px)
const LONG_PRESS_MS = 350
const MOVE_CANCEL_PX = 12

export interface UploadedMedia {
  url: string
  type: 'photo' | 'video'
  posterUrl?: string
  edit?: import('../lib/types').MediaEdit | null
}

/**
 * Multi photo/video picker for the composer carousel. Thumbnails in a row,
 * first item tagged as the cover, dashed tile to add more (up to 10).
 * Press-and-hold a thumbnail to drag it into a new order.
 * Uploads go to the drop-media bucket at <userId>/<uuid>.<ext>.
 */
export default function MediaUpload({
  userId,
  items,
  onAdd,
  onRemove,
  onReorder,
}: {
  userId: string
  items: UploadedMedia[]
  onAdd: (m: UploadedMedia[]) => void
  onRemove: (index: number) => void
  onReorder: (from: number, to: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ from: number; to: number } | null>(null)
  const touchPreventer = useRef<((e: TouchEvent) => void) | null>(null)

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressStart.current = null
  }

  const beginDrag = (i: number) => {
    pressTimer.current = null
    pressStart.current = null
    dragRef.current = { from: i, to: i }
    setDragIndex(i)
    setDropIndex(i)
    const prevent = (e: TouchEvent) => e.preventDefault()
    touchPreventer.current = prevent
    stripRef.current?.addEventListener('touchmove', prevent, { passive: false })
    if (navigator.vibrate) navigator.vibrate(10)
  }

  const endDrag = () => {
    if (touchPreventer.current) {
      stripRef.current?.removeEventListener('touchmove', touchPreventer.current)
      touchPreventer.current = null
    }
    const d = dragRef.current
    dragRef.current = null
    setDragIndex(null)
    setDropIndex(null)
    cancelPress()
    if (d && d.from !== d.to) onReorder(d.from, d.to)
  }

  const thumbPointerDown = (e: React.PointerEvent, i: number) => {
    if (dragIndex !== null) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressStart.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = window.setTimeout(() => beginDrag(i), LONG_PRESS_MS)
  }

  // Pre-drag: if the finger wanders before the long-press fires, it's a scroll — cancel.
  const stripPointerMove = (e: React.PointerEvent) => {
    if (dragIndex !== null) return
    const s = pressStart.current
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_CANCEL_PX) cancelPress()
  }

  // During a drag the finger may leave the strip — track on window.
  useEffect(() => {
    if (dragIndex === null) return
    const move = (e: PointerEvent) => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect || !dragRef.current) return
      const idx = Math.round((e.clientX - rect.left - PITCH / 2) / PITCH)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      dragRef.current.to = clamped
      setDropIndex(clamped)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex, items.length])

  const pick = async (files: FileList | File[]) => {
    setError(null)
    const list = [...files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (list.length === 0) {
      setError('Please choose photos or short videos.')
      return
    }
    const room = MAX_CAROUSEL_ITEMS - items.length
    if (room <= 0) return
    const batch = list.slice(0, room)
    const tooBig = batch.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      setError('One of those is over 20 MB — pick something smaller.')
      return
    }
    setBusy(true)
    try {
      const out: UploadedMedia[] = []
      const uploadedPaths: string[] = []
      try {
        for (const file of batch) {
          const isVideo = file.type.startsWith('video/')
          // Photos are downscaled before upload — uploads and every
          // later view of them get dramatically faster.
          const payload = isVideo ? file : await prepareImageForUpload(file)
          const ext = isVideo
            ? (file.name.split('.').pop() || 'mp4').toLowerCase().slice(0, 5)
            : 'jpg'
          const path = `${userId}/${crypto.randomUUID()}.${ext}`
          const { error: upErr } = await supabase.storage.from('drop-media').upload(path, payload, {
            contentType: isVideo ? file.type : 'image/jpeg',
            cacheControl: IMMUTABLE_CACHE_CONTROL,
            upsert: false,
          })
          if (upErr) throw upErr
          uploadedPaths.push(path)
          const { data } = supabase.storage.from('drop-media').getPublicUrl(path)
          out.push({ url: data.publicUrl, type: isVideo ? 'video' : 'photo' })
        }
      } catch (e) {
        // Partial batch failure: remove what THIS batch uploaded so files
        // never referenced by any post aren't orphaned. Only paths tracked
        // above are ever deleted — pre-existing items are untouched.
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('drop-media').remove(uploadedPaths)
        }
        throw e
      }
      onAdd(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div ref={stripRef} onPointerMove={stripPointerMove} className="flex gap-2 overflow-x-auto pb-1">
        {items.map((m, i) => (
          <div
            key={`${m.url}-${i}`}
            onPointerDown={(e) => thumbPointerDown(e, i)}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative h-24 w-24 shrink-0 select-none overflow-hidden rounded-xl border bg-black transition-shadow ${
              dragIndex === i
                ? 'z-10 scale-105 border-sig opacity-70 shadow-2xl'
                : dropIndex === i && dragIndex !== null
                  ? 'border-sig ring-2 ring-sig'
                  : 'border-line'
            }`}
          >
            {m.type === 'video' ? (
              <video src={m.url} poster={m.posterUrl} playsInline muted preload="metadata" className="pointer-events-none h-full w-full object-cover" />
            ) : (
              <img src={m.url} alt={`Attached ${i + 1}`} draggable={false} className="pointer-events-none h-full w-full object-cover" />
            )}
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-sig px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-ink">
                Cover
              </span>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRemove(i)}
              aria-label={`Remove item ${i + 1}`}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-black text-white"
            >
              ✕
            </button>
          </div>
        ))}
        {items.length < MAX_CAROUSEL_ITEMS && (
          <label
            className={`flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-ink-2 text-mute transition hover:border-sig hover:text-sig ${
              busy ? 'opacity-60' : ''
            }`}
          >
            <span className="text-2xl leading-none">{busy ? '◌' : '+'}</span>
            <span className="px-1 text-center text-[10px] font-bold leading-tight">
              {busy ? 'Uploading…' : items.length === 0 ? 'Add photos or video' : 'Add more'}
            </span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) pick(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {items.length > 1 && (
        <p className="mt-1 text-[11px] text-mute">The first one is the cover. Press and hold to reorder.</p>
      )}
      {error && <p className="mt-2 text-xs font-bold text-miss">{error}</p>}
    </div>
  )
}
