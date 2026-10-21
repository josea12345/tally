/** Video helpers: duration reads and client-side trimming to the 5s cap. */

export const CLIP_MAX_SECONDS = 60

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
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
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

export interface VideoEdit {
  /** seconds into the source where the output starts */
  start: number
  /** seconds into the source where the output ends */
  end: number
  /** playback rate baked into the output (0.5 = slow-mo, 2 = fast) */
  speed: number
  /** CSS filter string from PHOTO_FILTERS ('none' = no filter) */
  filterCss: string
  /** text stickers in normalized coordinates */
  texts: import('./filters').TextOverlay[]
}

/**
 * Bake an edit into a new video blob: trim range, speed, filter and
 * text stickers, in one real-time re-record through a canvas (the same
 * technique as trimVideoFront — the only iOS-safe way). Audio rides
 * through WebAudio; the element's playbackRate retimes it too.
 * onProgress reports 0..1 of expected real time.
 */
export async function exportEditedVideo(
  blob: Blob,
  edit: VideoEdit,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const { drawTextOverlays } = await import('./filters')
  if (!canTrimVideo()) {
    throw new Error('Editing is not supported on this device — post the clip as-is instead.')
  }
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
    const full = video.duration || 0
    const start = Math.max(0, Math.min(edit.start, Math.max(full - 0.3, 0)))
    const end = Math.max(start + 0.3, Math.min(edit.end, full || edit.end))
    const speed = Math.min(2, Math.max(0.5, edit.speed || 1))
    const expectedReal = (end - start) / speed

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 1280
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Edit failed — post the clip as-is instead.')
    const useFilter = edit.filterCss && edit.filterCss !== 'none'
    const draw = () => {
      try {
        if (useFilter) ctx.filter = edit.filterCss
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        ctx.filter = 'none'
        drawTextOverlays(ctx, edit.texts, canvas.width, canvas.height)
      } catch {
        /* frame not ready */
      }
      raf = requestAnimationFrame(draw)
    }

    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) throw new Error('Edit failed — post the clip as-is instead.')
    audioCtx = new AC()
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})
    const source = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    source.connect(dest)

    const stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ])
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : undefined
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }
    const done = new Promise<Blob>((res, rej) => {
      rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'video/mp4' }))
      rec.onerror = () => rej(new Error('Edit failed — post the clip as-is instead.'))
    })

    video.playbackRate = speed
    video.currentTime = start
    await new Promise<void>((res) => {
      const onSeeked = () => res()
      video.addEventListener('seeked', onSeeked, { once: true })
      setTimeout(res, 1200) // never hang on a seek
    })
    await video.play()
    draw()
    rec.start(250)
    const t0 = Date.now()
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        const realElapsed = (Date.now() - t0) / 1000
        onProgress?.(Math.min(realElapsed / Math.max(expectedReal, 0.1), 1))
        if (video.currentTime >= end - 0.03 || realElapsed > expectedReal + 2.5 || video.ended) {
          clearInterval(iv)
          resolve()
        }
      }, 120)
    })
    rec.stop()
    video.pause()
    cancelAnimationFrame(raf)
    raf = 0
    const out = await done
    await audioCtx.close().catch(() => {})
    audioCtx = null
    onProgress?.(1)
    return out
  } finally {
    if (raf) cancelAnimationFrame(raf)
    if (audioCtx) audioCtx.close().catch(() => {})
    URL.revokeObjectURL(url)
  }
}
