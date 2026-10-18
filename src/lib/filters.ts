/** Instagram-style color filters, baked into the photo via canvas before upload. */

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
export function applyFilterToBlob(blob: Blob, css: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        if (css && css !== 'none') ctx.filter = css
        ctx.drawImage(img, 0, 0)
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
