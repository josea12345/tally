import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PHOTO_FILTERS, applyFilterToBlob } from '../lib/filters'
import { setPendingUpload } from '../lib/pendingMedia'

/**
 * Full-bleed photo review: the shot fills the screen with a live filter,
 * a filter thumbnail rail at the bottom, retake (X) and Next floating up top.
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

  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const filter = useMemo(
    () => PHOTO_FILTERS.find((f) => f.id === filterId) ?? PHOTO_FILTERS[0]!,
    [filterId]
  )

  const next = async () => {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      const filtered = await applyFilterToBlob(blob, filter.css)
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
      <img
        src={url}
        alt="Your photo"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: filter.css === 'none' ? undefined : filter.css }}
      />

      {/* top: retake + next, floating */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
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
          onClick={next}
          disabled={busy}
          className="press rounded-full bg-sig px-6 py-2.5 text-sm font-black text-ink shadow-[0_4px_20px_rgba(69,200,255,0.4)] disabled:opacity-50"
        >
          {busy ? '…' : 'Next'}
        </button>
      </div>

      {error && (
        <p className="relative z-10 px-6 pt-3 text-center text-xs font-bold text-red-400">{error}</p>
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
