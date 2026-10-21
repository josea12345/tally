import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import {
  setPendingRawMedia,
  getDraftSound,
  setDraftSound,
  clearDraftSound,
  type SoundAttachment,
} from '../lib/pendingMedia'
import MusicSearch from '../components/MusicSearch'
import type { MusicTrack } from '../lib/music'
import { CLIP_MAX_SECONDS, formatDuration } from '../lib/video'
import PhotoReview from '../components/PhotoReview'

const CAPS = [15, 30, 60] as const

type CamState = 'starting' | 'live' | 'unavailable'
type Facing = 'environment' | 'user'

const TAP_MS = 350 // a quicker press counts as a photo tap
const RING_R = 44
const RING_CIRC = 2 * Math.PI * RING_R
const ZOOM_MAX = 8 // software pinch zoom range: 1x–8x

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

/**
 * Vine-style in-app camera with a Snapchat-vibe UI: full-screen viewfinder.
 * Tap the big button for a photo. Hold to record — release to pause, hold
 * again to keep building the clip (5s total), checkmark when it's done.
 * Falls back to the native camera when the browser won't grant camera access.
 */
export default function Camera() {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardRef = useRef(false)
  const rafRef = useRef<number>(0)
  const pressStartRef = useRef(0)
  const segStartRef = useRef(0)
  const recordedMsRef = useRef(0)
  const facingRef = useRef<Facing>('environment')

  const [camState, setCamState] = useState<CamState>('starting')
  const [facing, setFacing] = useState<Facing>('environment')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0) // total recorded seconds, incl. live segment
  const [segments, setSegments] = useState<number[]>([]) // banked segment durations
  const [error, setError] = useState<string | null>(null)
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null) // photo under review (in-place, no page hop)
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)
  // countdown timer: 0 = off, else seconds before the shot/record starts
  const [timerSec, setTimerSec] = useState(0)
  const [counting, setCounting] = useState<number | null>(null)
  const countdownIvRef = useRef<number | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const toggleRecRef = useRef(false) // recording started by countdown: tap again to stop
  // pinch zoom (software — iOS Safari exposes no hardware zoom control)
  const [zoom, setZoom] = useState(1)
  const [zoomFlash, setZoomFlash] = useState(false)
  const zoomRef = useRef(1)
  // clip length cap (TikTok's duration row): 15s / 30s / 60s
  const [cap, setCap] = useState<number>(CLIP_MAX_SECONDS)
  const capRef = useRef(CLIP_MAX_SECONDS)
  // soundtrack picked on the camera (TikTok's top pill) — rides the
  // composer's draft-sound slot into the post
  const [camSound, setCamSound] = useState<SoundAttachment | null>(null)
  const [soundSheet, setSoundSheet] = useState(false)
  const [soundHint, setSoundHint] = useState<string | null>(null)
  const zoomHideTimer = useRef<number | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)
  // zoom-aware record pipeline: canvas crops the zoomed cover region so the
  // recording matches the preview; mic audio is grafted onto the pipe
  const pipeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipeStreamRef = useRef<MediaStream | null>(null)
  const pipeRafRef = useRef(0)

  facingRef.current = facing

  const startStream = async (mode: Facing) => {
    teardownPipe() // the old stream's audio track (grafted into the pipe) is dying
    stopTracks(streamRef.current)
    streamRef.current = null
    setCamState('starting')
    setError(null)
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) {
      setCamState('unavailable')
      return
    }
    // Installed (standalone) web apps are where the camera hangs most — fail fast there.
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const timeoutMs = isStandalone ? 5000 : 10000
    // Never hang on the spinner: bail to the native-camera fallback on timeout.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: mode }, audio: true },
      { video: { facingMode: mode } },
    ]
    for (const constraints of attempts) {
      try {
        const stream = await withTimeout(md.getUserMedia(constraints), timeoutMs)
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // set as a property — React's muted attribute is unreliable and an
          // unmuted preview would cause audio feedback
          videoRef.current.muted = true
          await videoRef.current.play().catch(() => {})
          // a "live" stream with no frames is just a black screen — verify
          const hasFrames = await new Promise<boolean>((resolve) => {
            const v = videoRef.current
            if (!v) return resolve(false)
            if (v.videoWidth > 0 && v.readyState >= 2) return resolve(true)
            const t0 = Date.now()
            const check = () => {
              if (v.videoWidth > 0 && v.readyState >= 2) return resolve(true)
              if (Date.now() - t0 > 4000) return resolve(false)
              setTimeout(check, 200)
            }
            check()
          })
          if (!hasFrames) throw new Error('no frames')
        }
        setCamState('live')
        return
      } catch {
        /* try the next constraints set */
      }
    }
    setCamState('unavailable')
  }

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    startStream(facing)
    return () => {
      stopTracks(streamRef.current)
      streamRef.current = null
      cancelAnimationFrame(rafRef.current)
      teardownPipe()
      if (flashTimer.current) clearTimeout(flashTimer.current)
      if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current)
      if (countdownIvRef.current) window.clearInterval(countdownIvRef.current)
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, user])

  const tick = () => {
    const total = (recordedMsRef.current + (Date.now() - segStartRef.current)) / 1000
    setElapsed(total)
    if (total >= capRef.current) {
      finishVideo()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  /**
   * The WYSIWYG crop: the part of the camera frame the preview actually
   * shows (object-cover), zoomed around the center. Photos capture this
   * region; the record pipe draws it every frame. Falls back to the full
   * frame if layout numbers aren't ready.
   */
  const getCoverCrop = () => {
    const video = videoRef.current
    const vw = video?.videoWidth ?? 0
    const vh = video?.videoHeight ?? 0
    const bw = video?.clientWidth ?? 0
    const bh = video?.clientHeight ?? 0
    if (!video || vw === 0 || vh === 0 || bw === 0 || bh === 0) {
      return { sx: 0, sy: 0, sw: Math.max(vw, 2), sh: Math.max(vh, 2), dw: Math.max(vw, 2), dh: Math.max(vh, 2) }
    }
    const scale = Math.max(bw / vw, bh / vh)
    const baseW = bw / scale // visible frame width at 1x
    const baseH = bh / scale
    const z = zoomRef.current
    const sw = baseW / z
    const sh = baseH / z
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, dw: baseW, dh: baseH }
  }

  const setZoomLevel = (z: number) => {
    const cz = Math.min(ZOOM_MAX, Math.max(1, z))
    zoomRef.current = cz
    setZoom(cz)
    setZoomFlash(true)
    if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current)
    zoomHideTimer.current = window.setTimeout(() => setZoomFlash(false), 900)
  }

  // Two-finger pinch on the viewfinder.
  const onViewfinderDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current }
    }
  }
  const onViewfinderMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinchRef.current
    if (pointersRef.current.size === 2 && p && p.dist > 0) {
      const [a, b] = [...pointersRef.current.values()]
      setZoomLevel(p.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist))
    }
  }
  const onViewfinderUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }

  /** Build the record pipe: cover-crop canvas -> captureStream + mic audio. */
  const buildPipeStream = (): MediaStream | null => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.videoWidth === 0) return null
    try {
      const { dw, dh } = getCoverCrop()
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(2, Math.round(dw))
      canvas.height = Math.max(2, Math.round(dh))
      const ctx = canvas.getContext('2d')
      if (!ctx || typeof canvas.captureStream !== 'function') return null
      pipeCanvasRef.current = canvas
      const draw = () => {
        if (!pipeCanvasRef.current) return
        const v = videoRef.current
        if (v && v.videoWidth > 0) {
          const { sx, sy, sw, sh } = getCoverCrop()
          const W = canvas.width
          const H = canvas.height
          if (facingRef.current === 'user') {
            ctx.save()
            ctx.translate(W, 0)
            ctx.scale(-1, 1)
            ctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H)
            ctx.restore()
          } else {
            ctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H)
          }
        }
        pipeRafRef.current = requestAnimationFrame(draw)
      }
      draw()
      const cs = canvas.captureStream(30)
      const audio = stream.getAudioTracks()[0]
      if (audio) cs.addTrack(audio)
      return cs
    } catch {
      return null
    }
  }

  const teardownPipe = () => {
    cancelAnimationFrame(pipeRafRef.current)
    pipeCanvasRef.current = null
    pipeStreamRef.current = null
  }

  /** Get (or create) the segment recorder. One recorder spans all segments via pause/resume. */
  const ensureRecorder = (): MediaRecorder | null => {
    if (recRef.current) return recRef.current
    const stream = streamRef.current
    if (!stream) return null
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : undefined
      // Record through the zoom pipe so the clip matches the framed preview;
      // fall back to the raw stream if the pipe can't be built.
      if (!pipeStreamRef.current) pipeStreamRef.current = buildPipeStream()
      const rec = new MediaRecorder(pipeStreamRef.current ?? stream, {
        mimeType,
        videoBitsPerSecond: 1_500_000,
      })
      chunksRef.current = []
      discardRef.current = false
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const keep = !discardRef.current
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/mp4' })
        chunksRef.current = []
        recRef.current = null
        if (keep && blob.size > 0) {
          setPendingRawMedia(blob, 'clip.mp4', 'video')
          navigate('/video')
        }
      }
      recRef.current = rec
      return rec
    } catch {
      setError('Video recording is not supported here — try a photo instead.')
      return null
    }
  }

  /** Checkmark: finish the clip and move to review. */
  const finishVideo = () => {
    cancelAnimationFrame(rafRef.current)
    setRecording(false)
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  /** Trash: throw away every segment and start over. */
  const discardAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRecording(false)
    setSegments([])
    setElapsed(0)
    recordedMsRef.current = 0
    const rec = recRef.current
    discardRef.current = true
    if (rec && rec.state !== 'inactive') rec.stop()
    else recRef.current = null
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    // Capture exactly what's framed: the zoomed cover region, not the raw frame.
    const { sx, sy, sw, sh, dw, dh } = getCoverCrop()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.round(dw))
    canvas.height = Math.max(2, Math.round(dh))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // mirror the front camera so the photo matches the preview
    if (facingRef.current === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (b) => {
        if (b) {
          // shutter flash: instant tactile feedback the moment the photo lands
          setFlash(true)
          if (flashTimer.current) clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => setFlash(false), 240)
          // Review in place — same surface, no page hop to /filter.
          setReviewBlob(b)
        }
      },
      'image/jpeg',
      0.92
    )
  }

  const clearCountdown = () => {
    if (countdownIvRef.current) window.clearInterval(countdownIvRef.current)
    countdownIvRef.current = null
    setCounting(null)
  }

  /** Big-number countdown, then fire `then` (photo or record start). */
  const runCountdown = (seconds: number, then: () => void) => {
    clearCountdown()
    setCounting(seconds)
    let n = seconds
    countdownIvRef.current = window.setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearCountdown()
        then()
      } else {
        setCounting(n)
      }
    }, 1000)
  }

  /** Start (or resume) the segment recorder and the progress ring. */
  const startSegmentRecording = () => {
    const rec = ensureRecorder()
    if (!rec) return false
    try {
      segStartRef.current = Date.now()
      if (rec.state === 'paused') rec.resume()
      else if (rec.state === 'inactive') rec.start(250)
      setRecording(true)
      rafRef.current = requestAnimationFrame(tick)
      return true
    } catch {
      setError('Video recording is not supported here — try a photo instead.')
      return false
    }
  }

  /** Release-to-pause: bank the current segment. */
  const bankSegment = () => {
    const rec = recRef.current
    cancelAnimationFrame(rafRef.current)
    setRecording(false)
    if (!rec) return
    const segMs = Date.now() - segStartRef.current
    recordedMsRef.current += segMs
    setSegments((s) => [...s, segMs / 1000])
    setElapsed(recordedMsRef.current / 1000)
    try {
      if (rec.state === 'recording') rec.pause()
    } catch {
      /* already stopped */
    }
  }

  const onPressDown = (e: React.PointerEvent) => {
    e.preventDefault()
    if (counting != null) {
      // a press during the countdown cancels it
      clearCountdown()
      return
    }
    if (recording && toggleRecRef.current) {
      toggleRecRef.current = false
      bankSegment()
      return
    }
    if (camState !== 'live' || recording) return
    if (timerSec > 0 && segments.length === 0) {
      // Timer mode: a quick tap counts down to a photo; holding counts
      // down to a hands-free recording (tap again to stop it).
      pressStartRef.current = Date.now()
      pressTimerRef.current = window.setTimeout(() => {
        pressTimerRef.current = null
        runCountdown(timerSec, () => {
          toggleRecRef.current = true
          if (!startSegmentRecording()) toggleRecRef.current = false
        })
      }, TAP_MS)
      return
    }
    pressStartRef.current = Date.now()
    segStartRef.current = Date.now()
    const rec = ensureRecorder()
    if (!rec) return
    try {
      if (rec.state === 'paused') rec.resume()
      else if (rec.state === 'inactive') rec.start(250)
      setRecording(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError('Video recording is not supported here — try a photo instead.')
    }
  }

  const onPressUp = () => {
    if (counting != null) return
    if (pressTimerRef.current) {
      // released before the hold threshold in timer mode: photo countdown
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
      runCountdown(timerSec, takePhoto)
      return
    }
    if (toggleRecRef.current) return // countdown recording stops on the next press
    if (!recording) return
    const pressMs = Date.now() - pressStartRef.current
    const rec = recRef.current
    cancelAnimationFrame(rafRef.current)
    setRecording(false)
    if (!rec) return
    if (segments.length === 0 && pressMs < TAP_MS) {
      // quick tap with no segments yet: it was a photo — discard the blip
      discardRef.current = true
      recordedMsRef.current = 0
      if (rec.state !== 'inactive') rec.stop()
      else recRef.current = null
      takePhoto()
      return
    }
    // release to pause: bank the segment, hold again to continue
    const segMs = Date.now() - segStartRef.current
    recordedMsRef.current += segMs
    setSegments((s) => [...s, segMs / 1000])
    setElapsed(recordedMsRef.current / 1000)
    try {
      if (rec.state === 'recording') rec.pause()
    } catch {
      /* already stopped */
    }
  }

  const flip = () => {
    if (recording || segments.length > 0 || counting != null) return
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
  }

  const progress = Math.min(elapsed / cap, 1)
  const totalBanked = segments.reduce((a, b) => a + b, 0)

  const pickCamSound = (t: MusicTrack) => {
    if (t.kind !== 'track' || !t.preview) {
      setSoundHint('Pick a song — albums and artists don\'t have previews.')
      return
    }
    const s: SoundAttachment = {
      title: t.name,
      artist: t.artists,
      previewUrl: t.preview,
      coverUrl: t.image,
      start: 0,
      end: null,
    }
    setSoundHint(null)
    setCamSound(s)
    setDraftSound(s)
    setSoundSheet(false)
  }
  const clearCamSound = () => {
    setCamSound(null)
    clearDraftSound()
  }

  // Restore a sound picked earlier (composer draft slot) into the pill.
  useEffect(() => {
    const d = getDraftSound()
    if (d) setCamSound(d)
  }, [])

  return (
    <div className="screen-in fixed inset-0 z-50 select-none bg-black touch-none" onContextMenu={(e) => e.preventDefault()}>
      {/* always rendered so the ref exists before the stream arrives —
          attaching srcObject to a not-yet-rendered element was a black screen */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPointerDown={onViewfinderDown}
        onPointerMove={onViewfinderMove}
        onPointerUp={onViewfinderUp}
        onPointerCancel={onViewfinderUp}
        className={`absolute inset-0 h-full w-full object-cover ${camState === 'live' ? '' : 'invisible'}`}
        style={{ transform: `${facing === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})` }}
      />
      {flash && <div className="flash-out pointer-events-none absolute inset-0 z-20 bg-white" />}
      {counting != null && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span
            key={counting}
            className="seg-pop font-display text-[120px] font-black text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
          >
            {counting}
          </span>
        </div>
      )}
      {zoomFlash && zoom > 1.01 && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-black text-white backdrop-blur-sm">
          {zoom.toFixed(1)}×
        </div>
      )}

      {/* top bar — close left, sound pill center (TikTok layout) */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-start justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          onClick={() => navigate('/')}
          aria-label="Close camera"
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {recording ? (
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-2 backdrop-blur-sm">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm font-black tabular-nums text-white">{formatDuration(elapsed)}</span>
          </div>
        ) : camState === 'live' ? (
          <button
            onClick={() => setSoundSheet(true)}
            className="press flex max-w-[46%] items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-2.5 text-xs font-bold text-white backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
              <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span className="truncate">{camSound ? camSound.title : 'Add sound'}</span>
          </button>
        ) : (
          <span />
        )}
        <span className="w-10" />
      </div>

      {/* right tool rail — labeled, TikTok-style */}
      {camState === 'live' && !recording && !soundSheet && (
        <div className="absolute right-3 top-[21%] z-10 flex flex-col items-center gap-6">
          <button
            onClick={flip}
            disabled={segments.length > 0 || counting != null}
            className="flex flex-col items-center gap-1 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] disabled:opacity-40"
            aria-label="Flip camera"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
              <polyline points="1 4 1 10 7 10" />
              <polyline points="23 20 23 14 17 14" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
            <span className="text-[10px] font-bold">Flip</span>
          </button>
          <button
            onClick={() => setTimerSec((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))}
            disabled={segments.length > 0}
            className={`flex flex-col items-center gap-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] disabled:opacity-40 ${
              timerSec > 0 ? 'text-sig' : 'text-white'
            }`}
            aria-label="Countdown timer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
              <circle cx="12" cy="13" r="8" />
              <path strokeLinecap="round" d="M12 9v4l2.5 2.5M9 2h6" />
            </svg>
            <span className="text-[10px] font-bold">{timerSec > 0 ? `${timerSec}s` : 'Timer'}</span>
          </button>
          <button
            onClick={() => navigate('/create')}
            className="flex flex-col items-center gap-1 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
            aria-label="Write a text drop instead"
          >
            <span className="font-display text-[22px] font-black leading-none">Aa</span>
            <span className="text-[10px] font-bold">Text</span>
          </button>
        </div>
      )}

      {camState === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}

      {camState === 'unavailable' && <CameraFallback />}

      {error && (
        <p className="absolute left-0 right-0 top-20 px-6 text-center text-sm font-bold text-red-400">{error}</p>
      )}

      {/* segmented clip progress — one block per take, at the very top */}
      {camState === 'live' && (segments.length > 0 || recording) && (
        <div className="absolute left-0 right-0 top-[6px] z-20 px-2">
          <div key={segments.length} className="seg-pop flex h-[3px] gap-1">
            {segments.map((d, i) => (
              <div key={i} className="rounded-full bg-sig" style={{ flexGrow: Math.max(d, 0.05) }} />
            ))}
            {recording && (
              <div className="animate-pulse rounded-full bg-red-500" style={{ flexGrow: Math.max(elapsed - totalBanked, 0.05) }} />
            )}
            <div className="rounded-full bg-white/25" style={{ flexGrow: Math.max(cap - elapsed, 0.02) }} />
          </div>
        </div>
      )}

      {/* bottom controls */}
      {camState === 'live' && !soundSheet && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pb-10 pt-12">
          {/* duration row — directly above the record button */}
          {!recording && segments.length === 0 && (
            <div className="flex items-center gap-1 rounded-full bg-black/35 p-1 backdrop-blur-sm">
              {CAPS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCap(c)
                    capRef.current = c
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-black transition ${
                    cap === c ? 'bg-white text-black' : 'text-white/75'
                  }`}
                >
                  {c}s
                </button>
              ))}
            </div>
          )}
          <div className="flex w-full items-center justify-between">
            <div className="w-14">
              {segments.length > 0 && !recording ? (
                <button
                  onClick={discardAll}
                  aria-label="Discard clip"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
                  </svg>
                </button>
              ) : !recording ? (
                <button
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*,video/*'
                    input.onchange = () => {
                      const f = input.files?.[0]
                      if (!f) return
                      const kind = f.type.startsWith('video') ? 'video' : 'photo'
                      setPendingRawMedia(f, f.name, kind)
                      navigate(kind === 'photo' ? '/filter' : '/video')
                    }
                    input.click()
                  }}
                  className="flex flex-col items-center gap-1 text-white"
                  aria-label="Upload from library"
                >
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 border-white/80 bg-white/15">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="9" cy="9" r="1.6" />
                      <path d="M21 15.5l-4.5-4.5L9 18.5" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-[10px] font-bold">Upload</span>
                </button>
              ) : null}
            </div>
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
                {(recording || segments.length > 0) && (
                  <circle
                    cx="48"
                    cy="48"
                    r={RING_R}
                    fill="none"
                    stroke={recording ? '#ff5d6e' : '#45c8ff'}
                    strokeWidth="5"
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset={RING_CIRC * (1 - progress)}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <button
                onPointerDown={onPressDown}
                onPointerUp={onPressUp}
                onPointerLeave={onPressUp}
                onPointerCancel={onPressUp}
                aria-label="Capture: tap for photo, hold for video"
                className="shutter-btn absolute inset-2 flex items-center justify-center rounded-full border-4 border-white/95 bg-white/10 backdrop-blur-sm"
                style={{ touchAction: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
              >
                <span
                  className={`block transition-all ${
                    recording ? 'h-12 w-12 rounded-[16px] bg-red-500' : 'h-14 w-14 rounded-full bg-white'
                  }`}
                />
              </button>
            </div>
            <div className="flex w-14 justify-end">
              {segments.length > 0 && !recording && (
                <button
                  onClick={finishVideo}
                  aria-label="Done recording"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-sig text-ink shadow-[0_4px_20px_rgba(69,200,255,0.4)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-7 w-7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* sound picker sheet — the top pill opens this */}
      {soundSheet && camState === 'live' && (
        <div className="absolute inset-x-0 bottom-0 z-30 max-h-[62%] overflow-y-auto rounded-t-3xl border-t border-line bg-[#14131f]/[.98] px-4 pb-[max(env(safe-area-inset-bottom),18px)] pt-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-mute">Add sound</span>
            <button
              onClick={() => setSoundSheet(false)}
              className="rounded-full bg-sig px-4 py-1.5 text-xs font-black text-ink"
            >
              Done
            </button>
          </div>
          {camSound && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-3 py-2.5">
              {camSound.coverUrl && <img src={camSound.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-fog">{camSound.title}</span>
                <span className="block truncate text-xs text-mute">{camSound.artist} · rides into your post</span>
              </span>
              <button
                onClick={clearCamSound}
                aria-label="Remove sound"
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-black text-mute"
              >
                ✕
              </button>
            </div>
          )}
          <MusicSearch onPick={pickCamSound} />
          {soundHint && <p className="mt-1.5 text-xs font-bold text-butter">{soundHint}</p>}
          <p className="pt-2 text-center text-xs text-mute">
            Pick now, trim the part later in the editor.
          </p>
        </div>
      )}

      {/* in-place photo review — same surface, no page hop to /filter */}
      {reviewBlob && (
        <PhotoReview
          blob={reviewBlob}
          onRetake={() => setReviewBlob(null)}
          onDone={() => {
            setReviewBlob(null)
            navigate('/create')
          }}
        />
      )}
    </div>
  )
}

/** When the browser won't grant camera access: fall back to the native camera. */
function CameraFallback() {
  const openNative = (kind: 'photo' | 'video') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = kind === 'photo' ? 'image/*' : 'video/*'
    input.setAttribute('capture', 'environment')
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return
      setPendingRawMedia(f, f.name, kind)
      navigate(kind === 'photo' ? '/filter' : '/video')
    }
    input.click()
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="mb-2 text-lg font-black text-white">Camera unavailable here</div>
      <p className="mb-4 text-sm text-white/60">
        This browser won't share the camera — use your phone's camera app instead.
      </p>
      <button
        onClick={() => openNative('photo')}
        className="w-full rounded-full bg-sig py-3.5 text-base font-black text-ink"
      >
        Open camera
      </button>
      <button
        onClick={() => openNative('video')}
        className="w-full rounded-full border border-white/30 py-3.5 text-base font-black text-white"
      >
        Record video
      </button>
    </div>
  )
}
