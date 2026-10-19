import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { PHOTO_FILTERS, applyFilterToBlob } from '../lib/filters'
import { takePendingRawMedia, setPendingUpload } from '../lib/pendingMedia'

/** After the camera: pick a filter, bake it in, then continue to the composer. */
export default function Filter() {
  const { user } = useAuth()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [filterId, setFilterId] = useState('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    const pending = takePendingRawMedia()
    if (!pending || pending.kind !== 'photo') {
      navigate('/create')
      return
    }
    const url = URL.createObjectURL(pending.blob)
    setBlob(pending.blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [user])

  const filter = useMemo(
    () => PHOTO_FILTERS.find((f) => f.id === filterId) ?? PHOTO_FILTERS[0]!,
    [filterId]
  )

  const next = async () => {
    if (!blob || !user) return
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
      navigate('/create')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!objectUrl) return null

  return (
    <div className="screen-in flex min-h-screen flex-col bg-ink">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => navigate('/create')}
          className="text-sm font-bold text-mute"
          disabled={busy}
        >
          Cancel
        </button>
        <div className="text-sm font-black">New post</div>
        <button
          onClick={next}
          disabled={busy}
          className="rounded-full bg-sig px-5 py-2 text-sm font-black text-ink disabled:opacity-50"
        >
          {busy ? '…' : 'Next'}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black px-4">
        <img
          src={objectUrl}
          alt="Your photo"
          className="max-h-[52vh] w-auto rounded-xl object-contain"
          style={{ filter: filter.css === 'none' ? undefined : filter.css }}
        />
      </div>

      {error && <p className="px-4 pt-2 text-center text-xs font-bold text-miss">{error}</p>}

      <div className="px-4 pb-4 pt-3">
        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-mute">Filter</div>
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
                  src={objectUrl}
                  alt={f.name}
                  className="h-full w-full object-cover"
                  style={{ filter: f.css === 'none' ? undefined : f.css }}
                />
              </span>
              <span
                className={`text-[10px] font-bold ${f.id === filterId ? 'text-sig' : 'text-mute'}`}
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
