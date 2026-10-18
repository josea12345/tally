/** Video cover: capture the currently-displayed frame of a video element as a JPEG poster. */

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

/**
 * Capture whatever frame the video element is currently showing.
 * Called on the visible preview element (already seeked by the user's
 * scrubber), so no programmatic seeking is needed — this is what makes
 * it reliable on iOS, where seeks on detached video elements stall.
 */
export async function captureFrameFromElement(
  video: HTMLVideoElement,
  maxW = 720,
): Promise<Blob> {
  if (video.readyState < 2 || video.videoWidth === 0) {
    throw new Error('No frame decoded yet — play the clip first.')
  }
  const canvas = drawToCanvas(video, maxW)
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!out) throw new Error('Could not encode the cover frame.')
  return out
}
