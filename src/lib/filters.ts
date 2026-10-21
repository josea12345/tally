/** Instagram-style color filters, baked into the photo via canvas before upload. */

/** A text sticker placed on media — positions are normalized 0..1. */
export interface TextOverlay {
  id: string
  text: string
  x: number
  y: number
  color: string
  scale: number
}

export const OVERLAY_COLORS = ['#FFFFFF', '#45C8FF', '#FFD166', '#FF5D6E', '#7CFFB2', '#191725']

/** Draw text stickers onto a canvas at normalized positions. */
export function drawTextOverlays(
  ctx: CanvasRenderingContext2D,
  texts: TextOverlay[],
  w: number,
  h: number,
  sizeBasis: number = h,
) {
  for (const t of texts) {
    const clean = t.text.trim()
    if (!clean) continue
    const size = Math.max(14, Math.round(sizeBasis * 0.062 * t.scale))
    ctx.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = Math.max(3, size / 7)
    ctx.strokeStyle = 'rgba(10,10,18,0.85)'
    const x = t.x * w
    const y = t.y * h
    ctx.strokeText(clean, x, y)
    ctx.fillStyle = t.color
    ctx.fillText(clean, x, y)
  }
}

/** Canvas 2D filters are missing on older Safari — detect before offering them for video. */
export function canvasFilterSupported(): boolean {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) return false
    ctx.filter = 'grayscale(1)'
    return ctx.filter === 'grayscale(1)'
  } catch {
    return false
  }
}

export interface PhotoFilter {
  id: string
  name: string
  /** CSS filter syntax — used both for live preview and canvas baking. */
  css: string
}

export const PHOTO_FILTERS: PhotoFilter[] = [
  { id: 'normal', name: 'Normal', css: 'none' },
  { id: 'vivid', name: 'Vivid', css: 'contrast(1.12) saturate(1.45)' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.28) saturate(1.35) contrast(1.05) brightness(1.04)' },
  { id: 'golden', name: 'Golden', css: 'sepia(0.55) contrast(1.08) brightness(1.08) saturate(1.5)' },
  { id: 'cool', name: 'Cool', css: 'saturate(1.15) hue-rotate(-18deg) contrast(1.06)' },
  { id: 'rose', name: 'Rosé', css: 'sepia(0.18) saturate(1.7) hue-rotate(-35deg) contrast(1.04)' },
  { id: 'fade', name: 'Fade', css: 'contrast(0.88) brightness(1.12) saturate(0.65) sepia(0.25)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.3)' },
]

/** Render the blob through the filter on canvas and return a JPEG blob. */
export function applyFilterToBlob(
  blob: Blob,
  css: string,
  texts: TextOverlay[] = [],
  textSizeBasis?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const canvas = document.createElement('canvas')
        // Cap the bake at 2048px on the long edge: full-res phone shots
        // (5–12 MB) crawl through the encoder and the upload; this size
        // is visually identical in the app at a fraction of the time.
        const MAX_DIM = 2048
        const k = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
        canvas.width = Math.round(img.naturalWidth * k)
        canvas.height = Math.round(img.naturalHeight * k)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        if (css && css !== 'none') ctx.filter = css
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        ctx.filter = 'none'
        drawTextOverlays(ctx, texts, canvas.width, canvas.height, (textSizeBasis ?? img.naturalHeight) * k)
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))),
          'image/jpeg',
          0.92
        )
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not process that photo.'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that photo — try another."))
    }
    img.src = url
  })
}
