import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { setPendingRawMedia } from '../lib/pendingMedia'
import { CLIP_MAX_SECONDS, formatDuration } from '../lib/video'

type CamState = 'starting' | 'live' | 'unavailable'
type Facing = 'environment' | 'user'

const TAP_MS = 350 // a quicker press counts as a photo tap
const RING_R = 44
const RING_CIRC = 2 * Math.PI * RING_R

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

  facingRef.current = facing

  const startStream = async (mode: Facing) => {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, user])

  const tick = () => {
    const total = (recordedMsRef.current + (Date.now() - segStartRef.current)) / 1000
    setElapsed(total)
    if (total >= CLIP_MAX_SECONDS) {
      finishVideo()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  /** Get (or create) the segment recorder. One recorder spans all segments via pause/resume. */
  const ensureRecorder = (): MediaRecorder | null => {
    if (recRef.current) return recRef.current
    const stream = streamRef.current
    if (!stream) return null
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : undefined
      // Cap bitrate so a full-length clip stays upload-friendly (~19MB/min).
      const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
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
    const w = video.videoWidth
    const h = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // mirror the front camera so the photo matches the preview
    if (facingRef.current === 'user') {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (b) => {
        if (b) {
          setPendingRawMedia(b, 'camera.jpg', 'photo')
          navigate('/filter')
        }
      },
      'image/jpeg',
      0.92
    )
  }

  const onPressDown = (e: React.PointerEvent) => {
    e.preventDefault()
    if (camState !== 'live' || recording) return
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
    if (recording || segments.length > 0) return
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
  }

  const progress = Math.min(elapsed / CLIP_MAX_SECONDS, 1)
  const totalBanked = segments.reduce((a, b) => a + b, 0)

  return (
    <div className="fixed inset-0 z-50 select-none bg-black touch-none" onContextMenu={(e) => e.preventDefault()}>
      {/* always rendered so the ref exists before the stream arrives —
          attaching srcObject to a not-yet-rendered element was a black screen */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${camState === 'live' ? '' : 'invisible'}`}
        style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
      />

      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          onClick={() => navigate('/')}
          aria-label="Close camera"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {recording ? (
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm font-black tabular-nums text-white">{formatDuration(elapsed)}</span>
          </div>
        ) : (
          <div className="text-sm font-black tracking-widest text-white/80">TALLY</div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/create')}
            aria-label="Write a text drop instead"
            className="flex h-10 items-center gap-1.5 rounded-full bg-black/40 px-4 text-sm font-bold text-white"
          >
            <span aria-hidden>✎</span> Write
          </button>
          <button
            onClick={flip}
            aria-label="Flip camera"
            disabled={camState !== 'live' || recording}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-40"
          >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <polyline points="1 4 1 10 7 10" />
            <polyline points="23 20 23 14 17 14" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
          </button>
        </div>
      </div>

      {camState === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}

      {camState === 'unavailable' && <CameraFallback />}

      {error && (
        <p className="absolute left-0 right-0 top-20 px-6 text-center text-sm font-bold text-red-400">{error}</p>
      )}

      {/* segmented clip progress — Vine-style blocks filling to 5s */}
      {camState === 'live' && (segments.length > 0 || recording) && (
        <div className="absolute left-0 right-0 top-16 px-5">
          <div className="flex h-1 gap-1">
            {segments.map((d, i) => (
              <div key={i} className="rounded-full bg-sig" style={{ flexGrow: Math.max(d, 0.05) }} />
            ))}
            {recording && (
              <div className="animate-pulse rounded-full bg-red-500" style={{ flexGrow: Math.max(elapsed - totalBanked, 0.05) }} />
            )}
            <div className="rounded-full bg-white/25" style={{ flexGrow: Math.max(CLIP_MAX_SECONDS - elapsed, 0.02) }} />
          </div>
        </div>
      )}

      {/* bottom controls */}
      {camState === 'live' && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pb-10 pt-12">
          {!recording && (
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
              {segments.length === 0 ? 'Tap for photo · Hold for video' : 'Hold to keep recording'}
            </div>
          )}
          <div className="flex w-full items-center justify-between">
            <div className="w-14">
              {segments.length > 0 && !recording && (
                <button
                  onClick={discardAll}
                  aria-label="Discard clip"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
                  </svg>
                </button>
              )}
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
                className="absolute inset-2 flex items-center justify-center rounded-full border-4 border-white/95 bg-white/10 backdrop-blur-sm transition active:scale-95"
                style={{ touchAction: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
              >
                <span
                  className={`block h-14 w-14 rounded-full transition-all ${
                    recording ? 'scale-90 bg-red-500' : 'bg-white'
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
