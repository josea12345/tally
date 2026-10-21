import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { SoundOffIcon, SoundOnIcon } from '../components/MediaViewer'
import { takePendingRawMedia, setPendingUpload, type SoundAttachment } from '../lib/pendingMedia'
import MusicSearch from '../components/MusicSearch'
import WaveformTrimmer from '../components/WaveformTrimmer'
import FilmTrim from '../components/FilmTrim'
import type { MusicTrack } from '../lib/music'
import { claimSound, isCurrentSound, pauseSound, playSound, releaseSound, stopSound } from '../lib/sound'
import { CLIP_MAX_SECONDS, formatDuration, getVideoDuration, probeHasAudio, probeTrueEnd } from '../lib/video'
import { captureFrameFromElement } from '../lib/poster'
import {
  PHOTO_FILTERS,
  OVERLAY_COLORS,
  TEXT_FONTS,
  overlayTextStyle,
  scaleFilterCss,
  type TextOverlay,
} from '../lib/filters'
import type { MediaEdit } from '../lib/types'

const SPEEDS = [0.3, 0.5, 1, 2, 3]
type Tray = 'trim' | 'speed' | 'filter' | 'text' | 'sound' | 'volume'

/**
 * Clip editor, TikTok-style: full-screen looping preview, a labeled
 * tool rail on the right, and one bottom tray at a time (tap the
 * video to dismiss). Edits are stored as data and rendered live by
 * the players, so Next is instant: no export wait, ever.
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
  const [tray, setTray] = useState<Tray | null>(null)
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
    const vid = previewRef.current
    if (vid && !vid.paused) {
      playSound(t.preview, { start: 0, end: null }, Math.max(0, vid.currentTime - trimStart), soundVol, 'editor')
    }
  }
  // --- edit state ---
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState<number | null>(null)
  const [speed, setSpeed] = useState(1)
  const [filterId, setFilterId] = useState('normal')
  const [filterIntensity, setFilterIntensity] = useState(1)
  const [origVol, setOrigVol] = useState(1)
  const [soundVol, setSoundVol] = useState(1)
  const [phantomTail, setPhantomTail] = useState<number | null>(null)
  /** Whether the clip really contains an audio track (null = can't tell). */
  const [hasAudio, setHasAudio] = useState<boolean | null>(null)
  const [texts, setTexts] = useState<TextOverlay[]>([])
  const [selText, setSelText] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrubbingRef = useRef(false)
  const dragRef = useRef<string | null>(null)

  const filter = PHOTO_FILTERS.find((f) => f.id === filterId) ?? PHOTO_FILTERS[0]!
  const previewFilterCss = scaleFilterCss(filter.css, filterIntensity)

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
    probeHasAudio(url)
      .then(setHasAudio)
      .catch(() => {})
    getVideoDuration(pending.blob)
      .then((d) => {
        setDuration(d)
        // over-long clips start pre-trimmed to the cap — the handles fix the rest
        setTrimEnd(d > CLIP_MAX_SECONDS + 0.5 ? CLIP_MAX_SECONDS : d)
        // Phantom-tail repair: if the frames end well before the
        // container says the clip ends, clamp the trim to the true end.
        probeTrueEnd(url, d)
          .then((t) => {
            if (t != null && d - t > 0.35) {
              setPhantomTail(t)
              setTrimEnd((cur) =>
                cur == null || cur > t ? Math.round(t * 100) / 100 : cur,
              )
            }
          })
          .catch(() => {})
      })
      .catch(() => setDuration(null))
    return () => URL.revokeObjectURL(url)
  }, [user])

  // While the editor is open it exclusively drives the soundtrack;
  // leaving silences its preview and hands the song back.
  useEffect(() => {
    claimSound('editor')
    return () => {
      stopSound('editor')
      releaseSound('editor')
    }
  }, [])

  const end = trimEnd ?? duration ?? 0
  const outLen = duration != null ? (end - trimStart) / speed : 0
  const outTooLong = outLen > CLIP_MAX_SECONDS + 0.5
  const cleanTexts = texts.filter((t) => t.text.trim().length > 0)
  const dirty =
    trimStart > 0.05 ||
    (duration != null && end < duration - 0.05) ||
    speed !== 1 ||
    filterId !== 'normal' ||
    (filterId !== 'normal' && filterIntensity !== 1) ||
    origVol !== 1 ||
    soundVol !== 1 ||
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
      // Dragging fires a storm of events; coalesce the seeks.
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
        playSound(sound.previewUrl, { start: sound.start, end: sound.end }, 0, soundVol, 'editor')
      }
    }
    if (!vid.paused && !scrubbingRef.current) {
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

  const onVideoTap = () => {
    // Tapping the preview dismisses an open tray (TikTok's rule);
    // with no tray open it toggles play.
    if (tray) {
      setTray(null)
      return
    }
    togglePlay()
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const vid = previewRef.current
    const nextMuted = !muted
    setMuted(nextMuted)
    if (vid) {
      vid.muted = nextMuted
      if (!nextMuted) vid.volume = origVol
    }
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
      font: 'classic',
    }
    setTexts((prev) => [...prev, t])
    setSelText(t.id)
    setTray('text')
  }
  const patchText = (id: string, patch: Partial<TextOverlay>) =>
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const onOverlayDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    dragRef.current = id
    setSelText(id)
    setTray('text')
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
            ...(filter.css !== 'none'
              ? { filterCss: scaleFilterCss(filter.css, filterIntensity) }
              : {}),
            ...(cleanTexts.length > 0 ? { texts: cleanTexts } : {}),
            ...(origVol !== 1 ? { origVolume: Math.round(origVol * 100) / 100 } : {}),
            ...(soundVol !== 1 && sound ? { soundVolume: Math.round(soundVol * 100) / 100 } : {}),
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

  const railBtn = (
    id: Tray,
    label: string,
    icon: React.ReactNode,
    badge?: boolean,
  ) => (
    <button
      key={id}
      onClick={() => setTray((t) => (t === id ? null : id))}
      className={`flex flex-col items-center gap-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition ${
        tray === id ? 'text-sig' : 'text-white'
      }`}
      aria-label={label}
    >
      <span className="relative flex h-7 items-center justify-center">
        {icon}
        {badge && <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-sig" />}
      </span>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  )

  return (
    <div className="screen-in fixed inset-0 z-50 flex flex-col bg-black">
      {/* preview */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div
          ref={wrapRef}
          className="relative flex max-h-full items-center justify-center"
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
            onClick={onVideoTap}
            onPlay={() => {
              setPlaying(true)
              if (sound) {
                playSound(sound.previewUrl, { start: sound.start, end: sound.end }, Math.max(0, (previewRef.current?.currentTime ?? trimStart) - trimStart), soundVol, 'editor')
              }
            }}
            onPause={() => {
              setPlaying(false)
              if (sound && isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) pauseSound('editor')
            }}
            onTimeUpdate={onTimeUpdate}
            className="max-h-full w-auto max-w-full"
            style={{ filter: previewFilterCss === 'none' ? undefined : previewFilterCss }}
          />
          {texts.map((t) => (
            <span
              key={t.id}
              onPointerDown={(e) => onOverlayDown(e, t.id)}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab whitespace-nowrap ${
                selText === t.id && tray === 'text' ? 'rounded-lg outline outline-2 outline-sig' : ''
              }`}
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                ...overlayTextStyle(t, 15 * t.scale),
                touchAction: 'none',
              }}
            >
              {t.text || 'text'}
            </span>
          ))}
          {!playing && !tray && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-2xl text-white">
                ▶
              </div>
            </div>
          )}
        </div>

        {/* top bar: close · sound pill · next */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
          <button
            onClick={() => navigate('/create')}
            aria-label="Back"
            disabled={busy}
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            onClick={() => setTray('sound')}
            className="press flex max-w-[46%] items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
              <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span className="truncate">{sound ? sound.title : 'Add sound'}</span>
          </button>
          <button
            onClick={next}
            disabled={busy || outTooLong}
            className="press rounded-full bg-sig px-5 py-2.5 text-sm font-black text-ink shadow-[0_4px_20px_rgba(69,200,255,0.35)] disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Next'}
          </button>
        </div>

        {/* right tool rail */}
        {!tray && (
          <div className="absolute right-3 top-[24%] z-20 flex flex-col items-center gap-5">
            {railBtn('text', 'Text', <span className="font-display text-[22px] font-black leading-none">Aa</span>, cleanTexts.length > 0)}
            {railBtn(
              'sound',
              'Sound',
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>,
              !!sound,
            )}
            {railBtn(
              'trim',
              'Trim',
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
                <path d="M7.5 5.5v13M16.5 5.5v13M2.5 10h5M2.5 14h5M16.5 10h5M16.5 14h5" />
              </svg>,
            )}
            {railBtn(
              'speed',
              'Speed',
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                <path d="M4 5.5v13l8-6.5zM12 5.5v13l8-6.5z" />
              </svg>,
              speed !== 1,
            )}
            {railBtn(
              'filter',
              'Filters',
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                <circle cx="9" cy="9" r="5.5" />
                <circle cx="15" cy="9" r="5.5" />
                <circle cx="12" cy="15" r="5.5" />
              </svg>,
              filterId !== 'normal',
            )}
            {railBtn('volume', 'Audio', <SoundOnIcon />, origVol !== 1 || soundVol !== 1)}
          </div>
        )}

        {/* mute + length chip, bottom of the preview */}
        {!tray && (
          <>
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="absolute bottom-5 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"
            >
              {muted ? <SoundOffIcon /> : <SoundOnIcon />}
            </button>
            <div className="absolute bottom-5 left-4 z-20">
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-black ${
                  outTooLong ? 'bg-miss/20 text-miss' : 'bg-black/50 text-white backdrop-blur-sm'
                }`}
              >
                {duration != null ? `Out ${formatDuration(outLen)}` : '…'} / 1:00 max
                {speed !== 1 ? ` · ${speed}×` : ''}
              </span>
              {outTooLong && (
                <p className="mt-1.5 text-xs font-bold text-miss">Trim it or speed it up.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* bottom tray — one tool at a time */}
      {tray && (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-line bg-[#14131f]/[.97] px-4 pb-[max(env(safe-area-inset-bottom),18px)] pt-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-mute">
              {tray === 'trim' && 'Trim'}
              {tray === 'speed' && 'Speed'}
              {tray === 'filter' && 'Filters'}
              {tray === 'text' && 'Text'}
              {tray === 'sound' && 'Sound'}
              {tray === 'volume' && 'Audio'}
            </span>
            <button
              onClick={() => setTray(null)}
              className="rounded-full bg-sig px-4 py-1.5 text-xs font-black text-ink"
            >
              Done
            </button>
          </div>

          {tray === 'trim' && duration != null && duration > 0 && objectUrl && (
            <div>
              <FilmTrim
                src={objectUrl}
                duration={duration}
                trimStart={trimStart}
                trimEnd={end}
                playhead={scrub}
                filterCss={previewFilterCss === 'none' ? undefined : previewFilterCss}
                onTrim={(s, e) => {
                  setTrimStart(Math.round(s * 100) / 100)
                  setTrimEnd(Math.round(e * 100) / 100)
                }}
                onScrub={onScrub}
              />
              <p className="pt-2 text-center text-xs text-mute">
                Drag the end handles to trim. Drag the middle to scrub — where you stop is the cover frame.
              </p>
              {phantomTail != null && (
                <p className="pt-1.5 text-center text-xs font-bold text-butter">
                  Phantom tail cut at {formatDuration(phantomTail)} — the file claimed{' '}
                  {formatDuration(duration)} but its frames end there. Drag the handle if you want it back.
                </p>
              )}
            </div>
          )}

          {tray === 'speed' && (
            <div>
              <div className="flex justify-center gap-2 pt-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`rounded-full px-4 py-2.5 text-sm font-black transition ${
                      speed === s ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <p className="pt-2.5 text-center text-xs text-mute">
                {speed < 1 && 'Slow-mo — the moment, stretched.'}
                {speed === 1 && 'Original speed.'}
                {speed > 1 && 'Faster — and the output gets shorter too.'}
              </p>
            </div>
          )}

          {tray === 'filter' && (
            <div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 pt-1">
                {PHOTO_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterId(f.id)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${
                      filterId === f.id ? 'bg-lilac text-ink' : 'border border-line text-mute hover:text-fog'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              {filterId !== 'normal' && (
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-mute">Intensity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(filterIntensity * 100)}
                    onChange={(e) => setFilterIntensity(parseInt(e.target.value, 10) / 100)}
                    className="w-full accent-sig"
                    aria-label="Filter intensity"
                  />
                  <span className="w-9 text-right text-xs font-bold tabular-nums text-mute">
                    {Math.round(filterIntensity * 100)}
                  </span>
                </div>
              )}
            </div>
          )}

          {tray === 'text' && (
            <div>
              {!selected ? (
                <div className="pt-1 text-center">
                  <button
                    onClick={addText}
                    className="rounded-full border border-butter/60 px-5 py-2.5 text-sm font-black text-butter transition hover:bg-butter/10"
                  >
                    Aa — Add text
                  </button>
                  {texts.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 pt-3">
                      {texts.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelText(t.id)}
                          className="max-w-[45%] truncate rounded-full border border-line px-3 py-1.5 text-xs font-bold text-fog"
                        >
                          {t.text || 'text'}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="pt-2.5 text-xs text-mute">Drag it anywhere on the clip.</p>
                </div>
              ) : (
                <div>
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
                  {/* font carousel */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 pt-3">
                    {TEXT_FONTS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => patchText(selected.id, { font: f.id })}
                        className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5 transition ${
                          (selected.font ?? 'classic') === f.id
                            ? 'bg-sig/15 text-sig outline outline-1 outline-sig'
                            : 'text-mute hover:text-fog'
                        }`}
                      >
                        <span style={{ fontFamily: f.family, fontWeight: f.weight }} className="text-base leading-tight">
                          Ag
                        </span>
                        <span className="text-[9px] font-bold">{f.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
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
                    <button
                      onClick={() => patchText(selected.id, { bg: !selected.bg })}
                      className={`ml-1 rounded-full px-3 py-1.5 text-[11px] font-black ${
                        selected.bg ? 'bg-sig text-ink' : 'border border-line text-mute'
                      }`}
                    >
                      Block
                    </button>
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

          {tray === 'sound' && (
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
                        if (isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) stopSound('editor')
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
                    clipLength={Math.max(1, duration != null ? end - trimStart : 15)}
                    start={sound.start}
                    onChange={(start, e2) => setSound((s) => (s ? { ...s, start, end: e2 } : s))}
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

          {tray === 'volume' && (
            <div className="space-y-4 pt-1">
              {sound &&
                (() => {
                  const mode = soundVol === 0 ? 'original' : origVol === 0 ? 'song' : 'both'
                  const setMode = (m: 'original' | 'both' | 'song') => {
                    const o = m === 'song' ? 0 : m === 'both' ? 0.5 : 1
                    const s = m === 'original' ? 0 : 1
                    setOrigVol(o)
                    setSoundVol(s)
                    const vid = previewRef.current
                    if (vid && !muted) vid.volume = o
                    if (isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) {
                      playSound(sound.previewUrl, { start: sound.start, end: sound.end }, -1, s, 'editor')
                    }
                  }
                  return (
                    <div>
                      <div className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-mute">
                        What plays
                      </div>
                      <div className="flex rounded-full border border-line p-1">
                        {(
                          [
                            ['original', 'Original'],
                            ['both', 'Both'],
                            ['song', 'Song only'],
                          ] as const
                        ).map(([m, label]) => (
                          <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`flex-1 rounded-full py-2 text-xs font-black transition ${
                              mode === m ? 'bg-sig text-ink' : 'text-mute hover:text-fog'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="pt-1.5 text-[11px] text-mute">
                        {mode === 'original' && 'Just your clip’s own audio — the song stays off.'}
                        {mode === 'both' && 'Both play: original at half, song full. Fine-tune below.'}
                        {mode === 'song' && 'Just the song — your clip’s audio is muted.'}
                      </p>
                    </div>
                  )
                })()}
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-black uppercase tracking-widest text-mute">
                  <span>Original sound</span>
                  <span className="tabular-nums normal-case tracking-normal">{Math.round(origVol * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(origVol * 100)}
                  disabled={hasAudio === false}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) / 100
                    setOrigVol(v)
                    const vid = previewRef.current
                    if (vid && !muted) vid.volume = v
                  }}
                  className="w-full accent-sig disabled:opacity-40"
                  aria-label="Original sound volume"
                />
                <p className="text-[11px] text-mute">
                  {hasAudio === false
                    ? 'No original audio in this clip — the mic didn’t come through when it was recorded.'
                    : 'Your clip’s own audio. Unmute the preview to hear it.'}
                </p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-black uppercase tracking-widest text-mute">
                  <span>Added sound</span>
                  <span className="tabular-nums normal-case tracking-normal">{Math.round(soundVol * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(soundVol * 100)}
                  disabled={!sound}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) / 100
                    setSoundVol(v)
                    if (sound && isCurrentSound(sound.previewUrl, { start: sound.start, end: sound.end })) {
                      playSound(sound.previewUrl, { start: sound.start, end: sound.end }, -1, v, 'editor')
                    }
                  }}
                  className="w-full accent-butter disabled:opacity-40"
                  aria-label="Added sound volume"
                />
                <p className="text-[11px] text-mute">
                  {sound ? 'The soundtrack you added.' : 'Add a sound first — then mix it here.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="absolute inset-x-0 bottom-24 z-40 px-6 text-center text-xs font-bold text-miss">{error}</p>
      )}
      {busy && (
        <p className="absolute inset-x-0 top-20 z-40 text-center text-xs font-bold text-white/80">Uploading…</p>
      )}
    </div>
  )
}
