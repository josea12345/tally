/** Video cover frames: extract thumbnails for the picker and capture the chosen frame as a JPEG poster. */

export interface VideoFrame {
  time: number
  /** small JPEG data URL for the picker strip */
  url: string
}

function loadVideo(blob: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.muted = true
    ;(video as HTMLVideoElement).playsInline = true
    video.preload = 'auto'
    video.src = url
    video.onloadedmetadata = () => resolve({ video, url })
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that video.'))
    }
  })
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const dur = video.duration || 0
    const target = dur > 0.15 ? Math.min(Math.max(time, 0), dur - 0.05) : 0
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked)
      reject(new Error('Frame seek timed out.'))
    }, 5000)
    const onSeeked = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    // already there: some browsers won't fire seeked
    if (Math.abs(video.currentTime - target) < 0.01) {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      resolve()
      return
    }
    try {
      video.currentTime = target
    } catch {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      reject(new Error('Frame seek failed.'))
    }
  })
}

function drawToCanvas(video: HTMLVideoElement, maxW: number): HTMLCanvasElement {
  const scale = Math.min(1, maxW / Math.max(video.videoWidth, 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable.')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Evenly spaced thumbnails across the clip for the cover picker. */
export async function extractFrames(blob: Blob, count = 9): Promise<VideoFrame[]> {
  const { video, url } = await loadVideo(blob)
  try {
    const dur = video.duration || 1
    const frames: VideoFrame[] = []
    for (let i = 0; i < count; i++) {
      const time = count === 1 ? 0 : (i / (count - 1)) * Math.max(dur - 0.1, 0)
      await seekTo(video, time)
      frames.push({ time, url: drawToCanvas(video, 160).toDataURL('image/jpeg', 0.7) })
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Full-size JPEG of the frame at `time`, uploaded as the video's poster. */
export async function capturePoster(blob: Blob, time: number, maxW = 720): Promise<Blob> {
  const { video, url } = await loadVideo(blob)
  try {
    await seekTo(video, time)
    const canvas = drawToCanvas(video, maxW)
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!out) throw new Error('Could not encode the cover frame.')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}
