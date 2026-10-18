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
    const v = document.createElement('video')
    return typeof (v as unknown as { captureStream?: unknown }).captureStream === 'function'
  } catch {
    return false
  }
}

/**
 * Keep the first `seconds` of a video by re-recording playback through
 * canvas-free captureStream + MediaRecorder. Must be called from a user
 * gesture so playback (with audio) is allowed.
 */
export async function trimVideoFront(blob: Blob, seconds: number = CLIP_MAX_SECONDS): Promise<Blob> {
  if (!canTrimVideo()) throw new Error('Trimming is not supported on this device — please retake a shorter clip.')
  const url = URL.createObjectURL(blob)
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
    const stream = (
      video as unknown as { captureStream: () => MediaStream }
    ).captureStream()
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
    rec.start(250)
    await new Promise((r) => setTimeout(r, dur * 1000))
    rec.stop()
    video.pause()
    return done
  } finally {
    URL.revokeObjectURL(url)
  }
}
