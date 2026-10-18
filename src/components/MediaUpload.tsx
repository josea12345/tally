import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { MAX_CAROUSEL_ITEMS } from '../lib/types'

const MAX_BYTES = 20 * 1024 * 1024

export interface UploadedMedia {
  url: string
  type: 'photo' | 'video'
  posterUrl?: string
}

/**
 * Multi photo/video picker for the composer carousel. Thumbnails in a row,
 * first item tagged as the cover, dashed tile to add more (up to 10).
 * Uploads go to the drop-media bucket at <userId>/<uuid>.<ext>.
 */
export default function MediaUpload({
  userId,
  items,
  onAdd,
  onRemove,
}: {
  userId: string
  items: UploadedMedia[]
  onAdd: (m: UploadedMedia[]) => void
  onRemove: (index: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      for (const file of batch) {
        const isVideo = file.type.startsWith('video/')
        const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase().slice(0, 5)
        const path = `${userId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('drop-media').upload(path, file, {
          contentType: file.type,
          upsert: false,
        })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('drop-media').getPublicUrl(path)
        out.push({ url: data.publicUrl, type: isVideo ? 'video' : 'photo' })
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
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((m, i) => (
          <div key={`${m.url}-${i}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-black">
            {m.type === 'video' ? (
              <video src={m.url} poster={m.posterUrl} playsInline muted preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={m.url} alt={`Attached ${i + 1}`} className="h-full w-full object-cover" />
            )}
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-lime px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-ink">
                Cover
              </span>
            )}
            <button
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
            className={`flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-ink-2 text-mute transition hover:border-lime hover:text-lime ${
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
        <p className="mt-1 text-[11px] text-mute">The first one is the cover.</p>
      )}
      {error && <p className="mt-2 text-xs font-bold text-miss">{error}</p>}
    </div>
  )
}
