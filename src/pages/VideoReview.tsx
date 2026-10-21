import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { SoundOffIcon, SoundOnIcon } from '../components/MediaViewer'
import { takePendingRawMedia, setPendingUpload } from '../lib/pendingMedia'
import {
  CLIP_MAX_SECONDS,
  formatDuration,
  getVideoDuration,
  exportEditedVideo,
} from '../lib/video'
import { captureFrameFromElement } from '../lib/poster'
import {
  PHOTO_FILTERS,
  OVERLAY_COLORS,
  canvasFilterSupported,
  type TextOverlay,
} from '../lib/filters'

const SPEEDS = [0.5, 1, 1.5, 2]

/**
 * Clip editor: preview with trim handles, speed, filters and text
 * stickers. Edits bake into the uploaded file (one re-record pass),
 * so what you see here is exactly what posts.
 */
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
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  // --- edit state ---
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState<number | null>(null)
  const [speed, setSpeed] = useState(1)
  const [filterId, setFilterId] = useState('normal')
  const [texts, setTexts] = useState<TextOverlay[]>([])
  const [selText, setSelText] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrubbingRef = useRef(false)
  const dragRef = useRef<string | null>(null)

  const canFilter = useMemo(() => canvasFilterSupported(), [])
  const filter = PHOTO_FILTERS.find((f) => f.id === filterId) ?? PHOTO_FILTERS[0]!

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
      .then((d) => {
        setDuration(d)
        // over-long clips start pre-trimmed to the cap — the handles fix the rest
        setTrimEnd(d > CLIP_MAX_SECONDS + 0.5 ? CLIP_MAX_SECONDS : d)
      })
      .catch(() => setDuration(null))
    return () => URL.revokeObjectURL(url)
  }, [user])

  const end = trimEnd ?? duration ?? 0
  const outLen = duration != null ? (end - trimStart) / speed : 0
  const outTooLong = outLen > CLIP_MAX_SECONDS + 0.5
  const dirty =
    trimStart > 0.05 ||
    (duration != null && end < duration - 0.05) ||
    speed !== 1 ||
    filterId !== 'normal' ||
    texts.some((t) => t.text.trim().length > 0)

  useEffect(() => {
    const vid = previewRef.current
    if (vid) vid.playbackRate = speed
  }, [speed, objectUrl])

  const seekTo = (vid: HTMLVideoElement, t: number): Promise<void> =>
    new Promise((resolve) => {
      if (Math.abs(vid.currentTime - t) < 0.05) return resolve()
      const timer = setTimeout(() => {
        vid.removeEventListener('seeked', onSeeked)
        resolve()
      }, 2500)
      const onSeeked = () => {
        clearTimeout(timer)
        vid.removeEventListener('seeked', onSeeked)
        resolve()
      }
      vid.addEventListener('seeked', onSeeked)
      try {
        vid.currentTime = t
      } catch {
        clearTimeout(timer)
        vid.removeEventListener('seeked', onSeeked)
        resolve()
      }
    })

  const onScrub = (v: number) => {
    const vid = previewRef.current
    const t = Math.min(Math.max(v, trimStart), Math.max(end, trimStart))
    setScrub(t)
    if (vid) {
      vid.pause()
      seekTo(vid, t).catch(() => {})
    }
  }

  const onTimeUpdate = () => {
    const vid = previewRef.current
    if (!vid) return
    if (!vid.paused && vid.currentTime >= end - 0.02 && duration != null) {
      // loop inside the trim region while editing
      vid.currentTime = trimStart
    }
    if (!vid.paused && !scrubbingRef.current) {
      setScrub(Math.min(Math.max(vid.currentTime, trimStart), end))
    }
  }

  const togglePlay = () => {
    const vid = previewRef.current
    if (!vid || busy) return
    if (vid.paused) {
      if (vid.currentTime >= end - 0.05 || vid.currentTime < trimStart) {
        vid.currentTime = trimStart
      }
      vid.play().catch(() => {})
    } else {
      vid.pause()
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const vid = previewRef.current
    const next = !muted
    setMuted(next)
    if (vid) vid.muted = next
  }

  // --- text stickers ---
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
  const onOverlayDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    dragRef.current = id
    setSelText(id)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onOverlayMove = (e: React.PointerEvent) => {
    const id = dragRef.current
    const wrap = wrapRef.current
    if (!id || !wrap) return
    const r = wrap.getBoundingClientRect()
    const x = Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / Math.max(r.width, 1)))
    const y = Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / Math.max(r.height, 1)))
    patchText(id, { x, y })
  }
  const selected = texts.find((t) => t.id === selText) ?? null

  /** JPEG of the picked frame; undefined when uncapturable (clip still posts). */
  const captureCover = async (): Promise<string | undefined> => {
    const vid = previewRef.current
    if (!vid || !user) return undefined
    try {
      vid.pause()
      await seekTo(vid, Math.min(Math.max(scrub, trimStart), end))
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
    if (!blob || !user || outTooLong) return
    setBusy(true)
    setError(null)
    try {
      if (dirty) {
        setBusyLabel('Editing… 0%')
        const edited = await exportEditedVideo(
          blob,
          {
            start: trimStart,
            end,
            speed,
            filterCss: filter.css,
            texts: texts.filter((t) => t.text.trim().length > 0),
          },
          (p) => setBusyLabel(`Editing… ${Math.round(p * 100)}%`),
        )
        setBusyLabel('Uploading…')
        await uploadBlob(edited, 'clip.mp4')
      } else {
        setBusyLabel('Uploading…')
        await uploadBlob(blob, name)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
      setBusyLabel('Next')
    }
  }

  if (!objectUrl) return null

  return (
    <div className="screen-in flex min-h-screen flex-col bg-ink">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => navigate('/create')} className="text-sm font-bold text-mute" disabled={busy}>
          Cancel
        </button>
        <div className="text-sm font-black">Edit clip</div>
        <button
          onClick={next}
          disabled={busy || outTooLong}
          className="rounded-full bg-sig px-5 py-2 text-sm font-black text-ink disabled:opacity-50"
        >
          {busy ? busyLabel : 'Next'}
        </button>
      </div>

      <div className="flex items-center justify-center bg-black px-4 py-4">
        <div
          ref={wrapRef}
          className="relative"
          onPointerMove={onOverlayMove}
          onPointerUp={() => (dragRef.current = null)}
        >
          <video
            ref={(el) => {
              previewRef.current = el
              if (el) el.muted = true
            }}
            src={objectUrl}
            playsInline
            autoPlay
            muted
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={onTimeUpdate}
            className="max-h-[46vh] w-auto rounded-xl"
            style={{ filter: filter.css === 'none' ? undefined : filter.css }}
          />
          {texts.map((t) => (
            <span
              key={t.id}
              onPointerDown={(e) => onOverlayDown(e, t.id)}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab whitespace-nowrap font-black ${
                selText === t.id ? 'rounded-lg outline outline-2 outline-sig' : ''
              }`}
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                color: t.color,
                fontSize: `${15 * t.scale}px`,
                textShadow: '0 1px 6px rgba(0,0,0,0.85)',
                touchAction: 'none',
              }}
            >
              {t.text || 'text'}
            </span>
          ))}
          {!playing && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-2xl text-white">
                ▶
              </div>
            </div>
          )}
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
        </div>
      </div>

      {/* output summary */}
      <div className="flex items-center justify-center gap-2 px-4 pt-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            outTooLong ? 'bg-miss/15 text-miss' : 'bg-sig/15 text-sig'
          }`}
        >
          {duration != null ? `Out ${formatDuration(outLen)}` : '…'} / 1:00 max
          {speed !== 1 ? ` · ${speed}×` : ''}
        </span>
        {outTooLong && (
          <span className="text-xs font-bold text-miss">Trim it or speed it up to post.</span>
        )}
      </div>

      {duration != null && duration > 0 && (
        <div className="space-y-4 px-4 pt-4">
          {/* cover picker */}
          <div>
            <div className="mb-1.5 text-center text-[11px] font-black uppercase tracking-widest text-mute">
              Cover frame — drag to pick
            </div>
            <input
              type="range"
              min={trimStart}
              max={Math.max(end, trimStart + 0.1)}
              step={0.1}
              value={Math.min(Math.max(scrub, trimStart), end)}
              onPointerDown={() => (scrubbingRef.current = true)}
              onPointerUp={() => (scrubbingRef.current = false)}
              onChange={(e) => onScrub(parseFloat(e.target.value))}
              disabled={busy}
              className="w-full accent-sig"
              aria-label="Pick the cover frame"
            />
          </div>
          {/* trim handles */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-mute">
              <span>Trim</span>
              <span className="tabular-nums normal-case tracking-normal">
                {formatDuration(trimStart)} → {formatDuration(end)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-black text-mute">IN</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={trimStart}
                onChange={(e) => {
                  const v = Math.min(parseFloat(e.target.value), end - 0.5)
                  setTrimStart(Math.max(0, v))
                }}
                disabled={busy}
                className="w-full accent-butter"
                aria-label="Trim start"
              />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-8 text-[10px] font-black text-mute">OUT</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => {
                  const v = Math.max(parseFloat(e.target.value), trimStart + 0.5)
                  setTrimEnd(Math.min(duration, v))
                }}
                disabled={busy}
                className="w-full accent-butter"
                aria-label="Trim end"
              />
            </div>
          </div>
          {/* speed + filters + text */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-black uppercase tracking-widest text-mute">Speed</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                  speed === s ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
                }`}
              >
                {s}×
              </button>
            ))}
            <button
              onClick={addText}
              className="ml-auto rounded-full border border-butter/60 px-3 py-1.5 text-xs font-black text-butter transition hover:bg-butter/10"
            >
              Aa — Add text
            </button>
          </div>
          <div>
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              {PHOTO_FILTERS.map((f) => {
                const disabled = !canFilter && f.id !== 'normal'
                return (
                  <button
                    key={f.id}
                    onClick={() => !disabled && setFilterId(f.id)}
                    disabled={disabled}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition disabled:opacity-35 ${
                      filterId === f.id ? 'bg-lilac text-ink' : 'border border-line text-mute hover:text-fog'
                    }`}
                  >
                    {f.name}
                  </button>
                )
              })}
            </div>
            {!canFilter && (
              <p className="mt-1 text-[11px] text-mute">Filters need a newer browser on this device — everything else works.</p>
            )}
          </div>
          {/* selected text editor */}
          {selected && (
            <div className="rounded-2xl border border-line bg-ink-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={selected.text}
                  onChange={(e) => patchText(selected.id, { text: e.target.value.slice(0, 60) })}
                  placeholder="Say something"
                  className="min-w-0 flex-1 rounded-full border border-line bg-ink px-3.5 py-2 text-sm font-bold outline-none focus:border-sig"
                />
                <button
                  onClick={() => {
                    setTexts((prev) => prev.filter((t) => t.id !== selected.id))
                    setSelText(null)
                  }}
                  className="shrink-0 rounded-full border border-miss/40 px-3 py-2 text-xs font-black text-miss"
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
                        selected.scale === s ? 'bg-sig text-ink' : 'border border-line text-mute'
                      }`}
                    >
                      {s === 0.75 ? 'S' : s === 1 ? 'M' : 'L'}
                    </button>
                  ))}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-mute">Drag the text on the video to place it.</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="px-4 pt-2 text-center text-xs font-bold text-miss">{error}</p>}
      <div className="pb-6" />
    </div>
  )
}
