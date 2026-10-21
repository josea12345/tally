/**
 * Shrink a picked photo before upload: cap the long edge at 2048px and
 * re-encode as JPEG (~0.85). Phone photos arrive at 5–12 MB; after this
 * they're a few hundred KB — uploads finish fast and every feed/grid
 * that renders them loads fast too. Falls back to the original file on
 * any failure (decode quirks, exotic formats).
 */
export async function prepareImageForUpload(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const MAX = 2048
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
    if (scale >= 1 && file.size < 1_500_000) {
      bmp.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return file
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    return out ?? file
  } catch {
    return file
  }
}
