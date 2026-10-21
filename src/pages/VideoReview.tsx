import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { SoundOffIcon, SoundOnIcon } from '../components/MediaViewer'
import { takePendingRawMedia, setPendingUpload, type SoundAttachment } from '../lib/pendingMedia'
import MusicSearch from '../components/MusicSearch'
import WaveformTrimmer from '../components/WaveformTrimmer'
import type { MusicTrack } from '../lib/music'
import { isCurrentSound, pauseSound, playSound, stopSound } from '../lib/sound'
import { CLIP_MAX_SECONDS, formatDuration, getVideoDuration } from '../lib/video'
import { captureFrameFromElement } from '../lib/poster'
import {
  PHOTO_FILTERS,
  OVERLAY_COLORS,
  type TextOverlay,
} from '../lib/filters'
import type { MediaEdit } from '../lib/types'

const SPEEDS = [0.5, 1, 1.5, 2]
type EditorTab = 'trim' | 'speed' | 'filter' | 'text' | 'sound'

/**
 * Clip editor — one clean panel at a time (Trim / Speed / Filter /
 * Text). Edits are stored as data and rendered live by the players,
 * so Next is instant: no export wait, ever.
 */
export default function VideoReview() {
  const { user } = useAuth()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [name, setName] = useState('clip.mp4')
  const [duration, setDuration] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrub, setScrub] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [tab, setTab] = useState<EditorTab>('trim')
  // Soundtrack picked inside the editor; rides the pending upload.
  const [sound, setSound] = useState<SoundAttachment | null>(null)
  const [soundHint, setSoundHint] = useState<string | null>(null)
  const pickSound = (t: MusicTrack) => {
    if (t.kind !== 'track' || !t.preview) {
      setSoundHint('Pick a song — albums and artists don\'t have previews.')
      return
    }
    setSoundHint(null)
    setSound({ title: t.name, artist: t.artists, previewUrl: t.preview, coverUrl: t.image, start: 0, end: null })
    // Hear it with the picture right away if the preview is rolling.
    const vid = previewRef.current
    if (vid && !vid.paused) {
      playSound(t.preview, { start: 0, end: null }, Math.max(0, vid.currentTime - trimStart))
    }
  }
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
  const cleanTexts = texts.filter((t) => t.text.trim().length > 0)
  const dirty =
    trimStart > 0.05 ||
    (duration != null && end < duration - 0.05) ||
    speed !== 1 ||
    filterId !== 'normal' ||
    cleanTexts.length > 0

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

  const scrubSeekTimer = useRef<number | null>(null)
  const scrubTarget = useRef<number | null>(null)
  const onScrub = (v: number) => {
    const vid = previewRef.current
    const t = Math.min(Math.max(v, trimStart), Math.max(end, trimStart))
    setScrub(t)
    if (vid) {
      vid.pause()
      // Dragging fires a storm of input events; coalesce the seeks —
      // seeking per event is what made trimming feel like wading.
      scrubTarget.current = t
      if (scrubSeekTimer.current) return
      scrubSeekTimer.current = window.setTimeout(() => {
        scrubSeekTimer.current = null
        const target = scrubTarget.current
        const el = previewRef.current
        if (target != null && el) seekTo(el, target).catch(() => {})
      }, 70)
    }
  }

  const lastScrubPush = useRef(0)
  const onTimeUpdate = () => {
    const vid = previewRef.current
    if (!vid) return
    if (!vid.paused && vid.currentTime >= end - 0.02 && duration != null) {
      vid.currentTime = trimStart
      // Loop point: the song restarts its part with the picture.
      if (sound && isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) {
        playSound(sound.previewUrl, { start: sound.start, end: sound.end }, 0)
      }
    }
    if (!vid.paused && !scrubbingRef.current) {
      // Progress state at ~5fps is plenty for the scrubber — pushing it
      // on every timeupdate re-rendered the whole editor constantly.
      if (Math.abs(vid.currentTime - lastScrubPush.current) >= 0.2) {
        lastScrubPush.current = vid.currentTime
        setScrub(Math.min(Math.max(vid.currentTime, trimStart), end))
      }
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
    setTab('text')
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
    patchText(id, {
      x: Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / Math.max(r.width, 1))),
      y: Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / Math.max(r.height, 1))),
    })
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

  const next = async () => {
    if (!blob || !user || outTooLong || busy) return
    setBusy(true)
    setError(null)
    try {
      const edit: MediaEdit | null = dirty
        ? {
            ...(trimStart > 0.05 ? { trimStart: Math.round(trimStart * 100) / 100 } : {}),
            ...(duration != null && end < duration - 0.05
              ? { trimEnd: Math.round(end * 100) / 100 }
              : {}),
            ...(speed !== 1 ? { speed } : {}),
            ...(filter.css !== 'none' ? { filterCss: filter.css } : {}),
            ...(cleanTexts.length > 0 ? { texts: cleanTexts } : {}),
          }
        : null
      const posterUrl = await captureCover()
      const ext = (name.split('.').pop() || 'mp4').toLowerCase().slice(0, 5)
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('drop-media')
        .upload(path, blob, { contentType: blob.type || 'video/mp4', upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('drop-media').getPublicUrl(path)
      setPendingUpload({ url: data.publicUrl, type: 'video', posterUrl, edit, sound })
      navigate('/create')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!objectUrl) return null

  const TABS: Array<{ id: EditorTab; label: string }> = [
    { id: 'trim', label: 'Trim' },
    { id: 'speed', label: 'Speed' },
    { id: 'filter', label: 'Filter' },
    { id: 'text', label: 'Text' },
    { id: 'sound', label: 'Song' },
  ]

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
          {busy ? 'Uploading…' : 'Next'}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black px-4 py-3">
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
            onPlay={() => {
              setPlaying(true)
              // The picked song is the preview's audio: it starts with
              // the picture, positioned inside the trimmed region.
              if (sound) {
                playSound(sound.previewUrl, { start: sound.start, end: sound.end }, Math.max(0, (previewRef.current?.currentTime ?? trimStart) - trimStart))
              }
            }}
            onPause={() => {
              setPlaying(false)
              if (sound && isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) pauseSound()
            }}
            onTimeUpdate={onTimeUpdate}
            className="max-h-[50vh] w-auto rounded-xl"
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

      <div className="flex items-center justify-center gap-2 px-4 pt-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            outTooLong ? 'bg-miss/15 text-miss' : 'bg-sig/15 text-sig'
          }`}
        >
          {duration != null ? `Out ${formatDuration(outLen)}` : '…'} / 1:00 max
          {speed !== 1 ? ` · ${speed}×` : ''}
        </span>
        {outTooLong && <span className="text-xs font-bold text-miss">Trim it or speed it up.</span>}
      </div>

      {/* one panel at a time */}
      <div className="px-4 pt-3" style={{ minHeight: 148 }}>
        {tab === 'trim' && duration != null && duration > 0 && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-black uppercase tracking-widest text-mute">
                <span>Cover frame</span>
                <span className="tabular-nums normal-case tracking-normal">{formatDuration(Math.min(Math.max(scrub, trimStart), end))}</span>
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
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-black text-mute">IN</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={trimStart}
                onChange={(e) => setTrimStart(Math.max(0, Math.min(parseFloat(e.target.value), end - 0.5)))}
                disabled={busy}
                className="w-full accent-butter"
                aria-label="Trim start"
              />
              <span className="w-10 text-right text-xs font-bold tabular-nums text-mute">{formatDuration(trimStart)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-black text-mute">OUT</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => setTrimEnd(Math.min(duration, Math.max(parseFloat(e.target.value), trimStart + 0.5)))}
                disabled={busy}
                className="w-full accent-butter"
                aria-label="Trim end"
              />
              <span className="w-10 text-right text-xs font-bold tabular-nums text-mute">{formatDuration(end)}</span>
            </div>
          </div>
        )}
        {tab === 'speed' && (
          <div>
            <div className="flex justify-center gap-2 pt-2">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded-full px-5 py-3 text-sm font-black transition ${
                    speed === s ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <p className="pt-3 text-center text-xs text-mute">
              {speed === 0.5 && 'Slow-mo — the moment, stretched.'}
              {speed === 1 && 'Original speed.'}
              {speed === 1.5 && 'Brisk — trims the output length too.'}
              {speed === 2 && 'Double time — half the output length.'}
            </p>
          </div>
        )}
        {tab === 'filter' && (
          <div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-2">
              {PHOTO_FILTERS.map((f) => {
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilterId(f.id)}
                    className={`rounded-full px-4 py-2.5 text-xs font-black transition ${
                      filterId === f.id ? 'bg-lilac text-ink' : 'border border-line text-mute hover:text-fog'
                    }`}
                  >
                    {f.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {tab === 'text' && (
          <div>
            {!selected ? (
              <div className="pt-2 text-center">
                <button
                  onClick={addText}
                  className="rounded-full border border-butter/60 px-5 py-2.5 text-sm font-black text-butter transition hover:bg-butter/10"
                >
                  Aa — Add text
                </button>
                <p className="pt-3 text-xs text-mute">Drag it anywhere on the clip.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-ink-2 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={selected.text}
                    onChange={(e) => patchText(selected.id, { text: e.target.value.slice(0, 60) })}
                    placeholder="Say something"
                    autoFocus
                    className="min-w-0 flex-1 rounded-full border border-line bg-ink px-3.5 py-2 text-sm font-bold outline-none focus:border-sig"
                  />
                  <button
                    onClick={addText}
                    className="shrink-0 rounded-full border border-line px-3 py-2 text-xs font-black text-fog"
                  >
                    + Another
                  </button>
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
              </div>
            )}
          </div>
        )}

        {tab === 'sound' && (
          <div>
            {sound ? (
              <>
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-3 py-2.5">
                  {sound.coverUrl && <img src={sound.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{sound.title}</span>
                    <span className="block truncate text-xs text-mute">{sound.artist} · Soundtrack</span>
                  </span>
                  <button
                    onClick={() => {
                      if (isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) stopSound()
                      setSound(null)
                    }}
                    aria-label="Remove soundtrack"
                    className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-black text-mute hover:text-miss"
                  >
                    ✕
                  </button>
                </div>
                <WaveformTrimmer
                  previewUrl={sound.previewUrl}
                  clipLength={Math.max(1, (duration != null ? end - trimStart : 15))}
                  start={sound.start}
                  onChange={(start, end) => setSound((s) => (s ? { ...s, start, end } : s))}
                />
              </>
            ) : (
              <>
                <MusicSearch onPick={pickSound} />
                {soundHint && <p className="mt-1.5 text-xs font-bold text-butter">{soundHint}</p>}
                <p className="pt-2 text-center text-xs text-mute">
                  Put a song on it — then trim the part that plays.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* editor tab bar */}
      <div className="flex items-stretch justify-center gap-1 px-4 pb-7 pt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-5 py-2.5 text-sm font-black transition ${
              tab === t.id ? 'bg-ink-3 text-fog shadow-inner' : 'text-mute hover:text-fog'
            }`}
          >
            {t.label}
            {t.id === 'text' && cleanTexts.length > 0 ? ` · ${cleanTexts.length}` : ''}
            {t.id === 'sound' && sound ? ' · ♪' : ''}
          </button>
        ))}
      </div>

      {error && <p className="px-4 pb-3 text-center text-xs font-bold text-miss">{error}</p>}
    </div>
  )
}
