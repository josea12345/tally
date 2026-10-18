/** Video helpers: duration reads and client-side trimming to the 5s cap. */

export const CLIP_MAX_SECONDS = 5

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Read a blob's duration via a throwaway video element. */
export function getVideoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(v.duration)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that video.'))
    }
    v.src = url
  })
}

export function canTrimVideo(): boolean {
  if (typeof MediaRecorder === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return typeof canvas.captureStream === 'function'
  } catch {
    return false
  }
}

/**
 * Keep the first `seconds` of a video by re-recording it through a canvas
 * (video.captureStream isn't available on iOS Safari, canvas.captureStream is).
 * Audio is routed through WebAudio into the recording — never the speakers,
 * so the trim stays silent while keeping the clip's sound.
 * Must be called from a user gesture so playback is allowed.
 */
export async function trimVideoFront(blob: Blob, seconds: number = CLIP_MAX_SECONDS): Promise<Blob> {
  if (!canTrimVideo()) throw new Error('Trimming is not supported on this device — please retake a shorter clip.')
  const url = URL.createObjectURL(blob)
  let raf = 0
  let audioCtx: AudioContext | null = null
  try {
    const video = document.createElement('video')
    video.src = url
    video.playsInline = true
    video.preload = 'auto'
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res()
      video.onerror = () => rej(new Error('Could not read that video.'))
    })
    const dur = Math.min(seconds, video.duration || seconds)

    // video track: draw frames to a canvas, record the canvas stream
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 1280
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Trim failed — please retake a shorter clip.')
    const draw = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      } catch {
        /* a frame may not be ready yet */
      }
      raf = requestAnimationFrame(draw)
    }

    // audio track: element audio -> WebAudio -> recording (not the speakers;
    // creating the source node reroutes the element's output away from them)
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) throw new Error('Trim failed — please retake a shorter clip.')
    audioCtx = new AC()
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {})
    }
    const source = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    source.connect(dest)

    const stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ])
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : undefined
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }
    const done = new Promise<Blob>((res, rej) => {
      rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'video/mp4' }))
      rec.onerror = () => rej(new Error('Trim failed — please retake a shorter clip.'))
    })

    video.currentTime = 0
    await video.play()
    draw()
    rec.start(250)
    await new Promise((r) => setTimeout(r, dur * 1000))
    rec.stop()
    video.pause()
    cancelAnimationFrame(raf)
    raf = 0
    const out = await done
    await audioCtx.close().catch(() => {})
    audioCtx = null
    return out
  } finally {
    if (raf) cancelAnimationFrame(raf)
    if (audioCtx) audioCtx.close().catch(() => {})
    URL.revokeObjectURL(url)
  }
}
