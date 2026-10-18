/** Canvas-rendered 1080×1920 taste card PNG for sharing drops to stories. */
import type { Drop } from './types'
import { hitRateFor } from './stats'
import type { Verdict } from './types'

const W = 1080
const H = 1920

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function renderTasteCard(
  drop: Drop,
  authorName: string,
  authorHandle: string,
  verdicts: Verdict[]
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = '#0a0a0b'
  ctx.fillRect(0, 0, W, H)

  // Photo or typographic cover (top ~55%)
  const coverH = Math.floor(H * 0.55)
  let drewPhoto = false
  if (drop.media_url && drop.media_type === 'photo') {
    const img = await loadImage(drop.media_url)
    if (img) {
      const scale = Math.max(W / img.width, coverH / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (W - dw) / 2, (coverH - dh) / 2, dw, dh)
      drewPhoto = true
    }
  }
  if (!drewPhoto) {
    // typographic cover: giant lime tally marks
    ctx.fillStyle = '#121214'
    ctx.fillRect(0, 0, W, coverH)
    ctx.strokeStyle = '#c8f31d'
    ctx.lineWidth = 26
    ctx.lineCap = 'round'
    const cx = W / 2
    for (let i = -2; i <= 2; i++) {
      const x = cx + i * 110
      ctx.beginPath()
      ctx.moveTo(x, coverH / 2 - 130)
      ctx.lineTo(x, coverH / 2 + 130)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(cx - 300, coverH / 2 + 110)
    ctx.lineTo(cx + 300, coverH / 2 - 110)
    ctx.stroke()
  }
  // fade into body
  const grad = ctx.createLinearGradient(0, coverH - 220, 0, coverH + 40)
  grad.addColorStop(0, 'rgba(10,10,11,0)')
  grad.addColorStop(1, '#0a0a0b')
  ctx.fillStyle = grad
  ctx.fillRect(0, coverH - 220, W, 260)

  let y = coverH + 30
  const pad = 90

  // wordmark
  ctx.fillStyle = '#f4f4f2'
  ctx.font = '900 64px Inter, sans-serif'
  ctx.fillText('TALLY.', pad, y)
  const wm = ctx.measureText('TALLY.').width
  ctx.fillStyle = '#c8f31d'
  ctx.beginPath()
  ctx.arc(pad + wm + 24, y - 14, 12, 0, Math.PI * 2)
  ctx.fill()
  y += 90

  // place name
  ctx.fillStyle = '#f4f4f2'
  ctx.font = '800 76px Inter, sans-serif'
  for (const line of wrapText(ctx, drop.title, W - pad * 2).slice(0, 2)) {
    ctx.fillText(line, pad, y)
    y += 92
  }
  y += 10

  // HEAR ME OUT line
  ctx.fillStyle = '#c8f31d'
  ctx.font = '700 34px Inter, sans-serif'
  ctx.fillText('HEAR ME OUT', pad, y)
  y += 56
  ctx.fillStyle = '#f4f4f2'
  ctx.font = '400 40px Inter, sans-serif'
  for (const line of wrapText(ctx, `“${drop.description}”`, W - pad * 2).slice(0, 4)) {
    ctx.fillText(line, pad, y)
    y += 58
  }
  y += 40

  // author
  ctx.fillStyle = '#9a9aa0'
  ctx.font = '600 36px Inter, sans-serif'
  ctx.fillText(`put you on by ${authorName} · @${authorHandle}`, pad, y)
  y += 90

  // hit rate pill
  const hr = hitRateFor(verdicts)
  const pillText =
    hr.rate == null ? 'Record still building' : `${Math.round(hr.rate * 100)}% hit rate · ${hr.total} verdicts`
  ctx.font = '700 40px Inter, sans-serif'
  const tw = ctx.measureText(pillText).width
  const px = pad
  const py = y
  const ph = 84
  ctx.fillStyle = '#c8f31d'
  ctx.beginPath()
  ctx.roundRect(px, py, tw + 80, ph, 42)
  ctx.fill()
  ctx.fillStyle = '#0a0a0b'
  ctx.fillText(pillText, px + 40, py + 55)

  // footer
  ctx.fillStyle = '#9a9aa0'
  ctx.font = '500 30px Inter, sans-serif'
  ctx.fillText('Good taste deserves a track record.', pad, H - 90)

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/png')
  })
}

export async function shareTasteCard(blob: Blob, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], `tally-${title}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'TALLY taste card' })
      return 'shared'
    } catch {
      /* user dismissed — fall through to download */
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tally-${title}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
