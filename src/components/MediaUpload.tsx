import { useState } from 'react'
import { supabase } from '../lib/supabase'

const MAX_BYTES = 20 * 1024 * 1024

export interface UploadedMedia {
  url: string
  type: 'photo' | 'video'
}

/** Photo / short-video upload to the drop-media bucket at <userId>/<uuid>.<ext>. */
export default function MediaUpload({
  userId,
  current,
  onUploaded,
  onClear,
}: {
  userId: string
  current: UploadedMedia | null
  onUploaded: (m: UploadedMedia) => void
  onClear: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File) => {
    setError(null)
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      setError('Please choose a photo or a short video.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That file is over 20 MB — pick something smaller.')
      return
    }
    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase().slice(0, 5)
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('drop-media').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('drop-media').getPublicUrl(path)
      onUploaded({ url: data.publicUrl, type: isVideo ? 'video' : 'photo' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (current) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-line">
        {current.type === 'video' ? (
          <video src={current.url} controls playsInline className="max-h-64 w-full bg-black" />
        ) : (
          <img src={current.url} alt="Attached" className="max-h-64 w-full object-cover" />
        )}
        <button
          onClick={onClear}
          className="absolute right-2 top-2 rounded-full bg-ink/80 px-3 py-1 text-xs font-black text-fog"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <div>
      <label
        className={`flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-ink-2 px-4 py-6 text-mute transition hover:border-lime hover:text-lime ${
          busy ? 'opacity-60' : ''
        }`}
      >
        <span className="text-2xl">◉</span>
        <span className="text-sm font-bold">{busy ? 'Uploading…' : 'Add your photo or a short video'}</span>
        <input
          type="file"
          accept="image/*,video/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pick(f)
            e.target.value = ''
          }}
        />
      </label>
      {error && <p className="mt-2 text-xs font-bold text-miss">{error}</p>}
    </div>
  )
}
