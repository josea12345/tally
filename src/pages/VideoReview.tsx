import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { takePendingRawMedia, setPendingUpload } from '../lib/pendingMedia'
import {
  CLIP_MAX_SECONDS,
  formatDuration,
  getVideoDuration,
  trimVideoFront,
  canTrimVideo,
} from '../lib/video'
import { captureFrameFromElement } from '../lib/poster'

/** After video capture: preview, enforce the 5s cap (trim or retake), then composer. */
export default function VideoReview() {
  const { user } = useAuth()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [name, setName] = useState('clip.mp4')
  const [duration, setDuration] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('Next')
  const [error, setError] = useState<string | null>(null)
  const [scrub, setScrub] = useState(0)
  const previewRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    const pending = takePendingRawMedia()
    if (!pending || pending.kind !== 'video') {
      navigate('/create')
      return
    }
    const url = URL.createObjectURL(pending.blob)
    setBlob(pending.blob)
    setName(pending.name)
    setObjectUrl(url)
    getVideoDuration(pending.blob)
      .then(setDuration)
      .catch(() => setDuration(null))
    return () => URL.revokeObjectURL(url)
  }, [user])

  const tooLong = duration != null && duration > CLIP_MAX_SECONDS + 0.5
  // trimming keeps the first CLIP_MAX_SECONDS, so the picker is capped there too
  const scrubMax = duration != null ? (tooLong ? Math.min(duration, CLIP_MAX_SECONDS) : duration) : 0

  const onScrub = (v: number) => {
    const vid = previewRef.current
    const t = Math.min(Math.max(v, 0), scrubMax)
    setScrub(t)
    if (vid) {
      vid.pause()
      try {
        vid.currentTime = t
      } catch {
        /* seek errors leave the current frame in place */
      }
    }
  }

  /** JPEG of the frame the preview is showing; undefined when uncapturable (clip still posts). */
  const captureCover = async (): Promise<string | undefined> => {
    const vid = previewRef.current
    if (!vid || !user) return undefined
    try {
      const poster = await captureFrameFromElement(vid)
      const ppath = `${user.id}/${crypto.randomUUID()}.jpg`
      const { error: pErr } = await supabase.storage
        .from('drop-media')
        .upload(ppath, poster, { contentType: 'image/jpeg', upsert: false })
      if (pErr) throw pErr
      return supabase.storage.from('drop-media').getPublicUrl(ppath).data.publicUrl
    } catch {
      return undefined
    }
  }

  const uploadBlob = async (b: Blob, fileName: string) => {
    if (!user) return
    const posterUrl = await captureCover()
    const ext = (fileName.split('.').pop() || 'mp4').toLowerCase().slice(0, 5)
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('drop-media')
      .upload(path, b, { contentType: b.type || 'video/mp4', upsert: false })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('drop-media').getPublicUrl(path)
    setPendingUpload({ url: data.publicUrl, type: 'video', posterUrl })
    navigate('/create')
  }

  const next = async () => {
    if (!blob || !user || tooLong) return
    setBusy(true)
    setBusyLabel('Uploading…')
    setError(null)
    try {
      await uploadBlob(blob, name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
      setBusyLabel('Next')
    }
  }

  const keepFirst10 = async () => {
    if (!blob || !user) return
    setBusy(true)
    setBusyLabel('Trimming…')
    setError(null)
    try {
      const trimmed = await trimVideoFront(blob, CLIP_MAX_SECONDS)
      setBusyLabel('Uploading…')
      await uploadBlob(trimmed, 'clip.mp4')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trim failed — please retake a shorter clip.')
    } finally {
      setBusy(false)
      setBusyLabel('Next')
    }
  }

  if (!objectUrl) return null

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => navigate('/create')} className="text-sm font-bold text-mute" disabled={busy}>
          Cancel
        </button>
        <div className="text-sm font-black">New clip</div>
        <button
          onClick={next}
          disabled={busy || tooLong}
          className="rounded-full bg-lime px-5 py-2 text-sm font-black text-ink disabled:opacity-50"
        >
          {busy ? busyLabel : 'Next'}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black px-4 py-4">
        <video
          ref={(el) => {
            previewRef.current = el
            if (el) el.muted = true
          }}
          src={objectUrl}
          controls
          playsInline
          autoPlay
          className="max-h-[52vh] w-auto rounded-xl"
        />
      </div>

      <div className="flex items-center justify-center gap-2 px-4 pt-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            tooLong ? 'bg-miss/15 text-miss' : 'bg-lime/15 text-lime'
          }`}
        >
          {duration != null ? formatDuration(duration) : '…'} / 0:{String(CLIP_MAX_SECONDS).padStart(2, '0')}
        </span>
      </div>

      {duration != null && duration > 0 && (
        <div className="px-4 pt-3">
          <div className="mb-1.5 text-center text-[11px] font-black uppercase tracking-widest text-mute">
            Cover frame — drag to pick
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={scrubMax}
              step={0.1}
              value={Math.min(scrub, scrubMax)}
              onChange={(e) => onScrub(parseFloat(e.target.value))}
              disabled={busy}
              className="w-full accent-lime"
              aria-label="Pick the cover frame"
            />
            <span className="shrink-0 text-xs font-bold tabular-nums text-mute">
              {formatDuration(Math.min(scrub, scrubMax))}
            </span>
          </div>
        </div>
      )}

      {tooLong && (
        <div className="px-4 pt-3">
          <div className="rounded-2xl border border-miss/40 bg-miss/10 p-4 text-center">
            <p className="mb-3 text-sm font-bold">
              That one's {duration != null ? formatDuration(duration) : 'too long'} — clips max out at{' '}
              {CLIP_MAX_SECONDS} seconds.
            </p>
            <div className="flex gap-2">
              {canTrimVideo() && (
                <button
                  onClick={keepFirst10}
                  disabled={busy}
                  className="flex-1 rounded-full bg-lime py-2.5 text-sm font-black text-ink disabled:opacity-50"
                >
                  {busy ? busyLabel : `Keep first ${CLIP_MAX_SECONDS}s`}
                </button>
              )}
              <button
                onClick={() => navigate('/camera')}
                disabled={busy}
                className="flex-1 rounded-full border border-line py-2.5 text-sm font-black text-fog disabled:opacity-50"
              >
                Retake
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="px-4 pt-2 text-center text-xs font-bold text-miss">{error}</p>}
      <div className="pb-6" />
    </div>
  )
}
