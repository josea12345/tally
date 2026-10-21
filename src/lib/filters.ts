/** Instagram-style color filters, baked into the photo via canvas before upload. */

/** A text sticker placed on media — positions are normalized 0..1. */
export interface TextOverlay {
  id: string
  text: string
  x: number
  y: number
  color: string
  scale: number
  /** Font style id (see TEXT_FONTS). Absent = classic. */
  font?: string
  /** Background block behind the text (TikTok-style). */
  bg?: boolean
  /** When the text is on screen, in edited-timeline seconds (0 = the
   *  clip's first frame after trimming). Absent/null = whole clip. */
  start?: number | null
  end?: number | null
}

/** Is this overlay visible at edited-timeline position `pos`? */
export function textVisibleAt(t: TextOverlay, pos: number): boolean {
  if (t.start != null && pos < t.start) return false
  if (t.end != null && pos > t.end) return false
  return true
}

export const OVERLAY_COLORS = ['#FFFFFF', '#45C8FF', '#FFD166', '#FF5D6E', '#7CFFB2', '#191725']

/** TikTok-style text fonts: a small carousel of looks. */
export const TEXT_FONTS: Array<{ id: string; name: string; family: string; weight: number; glow?: boolean }> = [
  { id: 'classic', name: 'Classic', family: "system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 900 },
  { id: 'typewriter', name: 'Typewriter', family: "ui-monospace, 'SF Mono', Menlo, monospace", weight: 700 },
  { id: 'handwriting', name: 'Handwriting', family: "'Bradley Hand', 'Segoe Script', cursive", weight: 700 },
  { id: 'neon', name: 'Neon', family: "system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 800, glow: true },
  { id: 'serif', name: 'Serif', family: "Georgia, 'Times New Roman', serif", weight: 700 },
]

export function textFont(fontId?: string) {
  return TEXT_FONTS.find((f) => f.id === fontId) ?? TEXT_FONTS[0]!
}

/** Inline style for a live (DOM) text overlay at a given pixel size. */
export function overlayTextStyle(
  t: TextOverlay,
  px: number,
): React.CSSProperties {
  const f = textFont(t.font)
  return {
    fontFamily: f.family,
    fontWeight: f.weight,
    color: t.color,
    fontSize: `${px}px`,
    ...(t.bg
      ? {
          backgroundColor: 'rgba(10,10,18,0.72)',
          padding: '0.12em 0.45em',
          borderRadius: '0.35em',
          textShadow: 'none',
        }
      : {
          textShadow: f.glow
            ? `0 0 6px ${t.color}, 0 0 18px ${t.color}, 0 1px 4px rgba(0,0,0,0.6)`
            : '0 1px 6px rgba(0,0,0,0.85)',
        }),
  }
}

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
    const f = textFont(t.font)
    ctx.font = `${f.weight} ${size}px ${f.family}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const x = t.x * w
    const y = t.y * h
    if (t.bg) {
      const tw = ctx.measureText(clean).width
      const padX = size * 0.45
      const padY = size * 0.22
      const rx = x - tw / 2 - padX
      const ry = y - size / 2 - padY
      const rw = tw + padX * 2
      const rh = size + padY * 2
      const r = size * 0.32
      ctx.beginPath()
      ctx.roundRect(rx, ry, rw, rh, r)
      ctx.fillStyle = 'rgba(10,10,18,0.72)'
      ctx.fill()
      ctx.fillStyle = t.color
      ctx.fillText(clean, x, y)
      continue
    }
    if (f.glow) {
      ctx.shadowColor = t.color
      ctx.shadowBlur = size * 0.55
    } else {
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }
    ctx.lineWidth = Math.max(3, size / 7)
    ctx.strokeStyle = 'rgba(10,10,18,0.85)'
    ctx.strokeText(clean, x, y)
    ctx.fillStyle = t.color
    ctx.fillText(clean, x, y)
    ctx.shadowBlur = 0
  }
}

/**
 * Scale a CSS filter string toward neutral by `intensity` (0..1) —
 * TikTok's filter strength slider. Neutral points: 1 for
 * brightness/contrast/saturate, 0 for sepia/grayscale/invert,
 * 0deg for hue-rotate, 0px for blur.
 */
export function scaleFilterCss(css: string, intensity: number): string {
  if (!css || css === 'none' || intensity >= 1) return css
  const neutral: Record<string, number> = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    'hue-rotate': 0,
    blur: 0,
    opacity: 1,
  }
  return css.replace(/([a-z-]+)\((-?[\d.]+)([a-z%]*)\)/g, (_m, fn: string, val: string, unit: string) => {
    const v = parseFloat(val)
    const n = neutral[fn] ?? 0
    const scaled = n + (v - n) * Math.max(0, Math.min(1, intensity))
    return `${fn}(${Math.round(scaled * 1000) / 1000}${unit})`
  })
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
