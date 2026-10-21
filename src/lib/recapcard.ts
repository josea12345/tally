/** Canvas-rendered 1080×1920 "My week on TALLY" recap card for stories. */
import type { Profile } from './types'

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

export interface RecapStats {
  w: number
  l: number
  tallies: number
  comments: number
  followers: number
}

/**
 * Story-sized recap: avatar + handle, the week's W–L headline, the
 * supporting counts, and Taste/Trust scores when they exist.
 */
export async function renderRecapCard(
  profile: Profile,
  week: RecapStats,
  tasteScore: number | null,
  trustScore: number | null,
  streak = 0,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#12101d'
  ctx.fillRect(0, 0, W, H)
  // Sig glow band across the top.
  const grad = ctx.createLinearGradient(0, 0, W, 0)
  grad.addColorStop(0, '#45C8FF')
  grad.addColorStop(1, '#b7a8ff')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, 18)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#45C8FF'
  ctx.font = '900 44px Inter, sans-serif'
  ctx.fillText('T A L L Y', W / 2, 150)

  ctx.fillStyle = '#f2f0fa'
  ctx.font = '900 92px Inter, sans-serif'
  ctx.fillText('MY WEEK', W / 2, 300)

  // Avatar (circle-clipped) + handle.
  const avatar = profile.avatar_url ? await loadImage(profile.avatar_url) : null
  const cx = W / 2
  const cy = 520
  const r = 130
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    const s = Math.max((r * 2) / avatar.width, (r * 2) / avatar.height)
    ctx.drawImage(avatar, cx - (avatar.width * s) / 2, cy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s)
  } else {
    ctx.fillStyle = '#262338'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = '#45C8FF'
    ctx.font = '900 110px Inter, sans-serif'
    ctx.fillText((profile.display_name ?? profile.username).slice(0, 1).toUpperCase(), cx, cy + 40)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#45C8FF'
  ctx.lineWidth = 6
  ctx.stroke()

  ctx.fillStyle = '#f2f0fa'
  ctx.font = '800 54px Inter, sans-serif'
  ctx.fillText(profile.display_name || `@${profile.username}`, W / 2, 730)
  ctx.fillStyle = '#9a94b8'
  ctx.font = '600 38px Inter, sans-serif'
  ctx.fillText(`@${profile.username}`, W / 2, 785)

  // Headline: the week's verdict record.
  const wl = `${week.w} W · ${week.l} L`
  let wlSize = 190
  ctx.font = `900 ${wlSize}px Inter, sans-serif`
  while (ctx.measureText(wl).width > W - 120 && wlSize > 90) {
    wlSize -= 14
    ctx.font = `900 ${wlSize}px Inter, sans-serif`
  }
  ctx.fillStyle = '#f2f0fa'
  ctx.fillText(wl, W / 2, 1010)
  ctx.fillStyle = '#9a94b8'
  ctx.font = '700 36px Inter, sans-serif'
  ctx.fillText('VERDICTS ON MY DROPS', W / 2, 1075)

  // Supporting counts, three across.
  const stats: Array<[string, string]> = [
    [String(week.tallies), 'NEW TALLIES'],
    [String(week.comments), 'COMMENTS'],
    [String(week.followers), 'NEW FOLLOWS'],
  ]
  stats.forEach(([value, label], i) => {
    const x = 200 + i * 340
    ctx.fillStyle = '#f2f0fa'
    ctx.font = '900 96px Inter, sans-serif'
    ctx.fillText(value, x, 1260)
    ctx.fillStyle = '#9a94b8'
    ctx.font = '700 30px Inter, sans-serif'
    ctx.fillText(label, x, 1315)
  })

  // Score pills.
  const pills: Array<[string, string]> = []
  if (tasteScore != null) pills.push([`TASTE SCORE ${tasteScore}`, '#45C8FF'])
  if (trustScore != null) pills.push([`TRUST ${trustScore}`, '#69e7cf'])
  if (streak >= 2) pills.push([`STREAK ${streak} WK`, '#FFD166'])
  if (pills.length > 0) {
    ctx.font = '800 40px Inter, sans-serif'
    const widths = pills.map(([t]) => ctx.measureText(t).width + 72)
    const totalW = widths.reduce((a, b) => a + b, 0) + (pills.length - 1) * 24
    let px = (W - totalW) / 2
    pills.forEach(([t, color], i) => {
      const w = widths[i]
      ctx.beginPath()
      ctx.roundRect(px, 1420, w, 84, 42)
      ctx.fillStyle = '#262338'
      ctx.fill()
      ctx.fillStyle = color
      ctx.fillText(t, px + w / 2, 1476)
      px += w + 24
    })
  }

  ctx.fillStyle = '#6f6a85'
  ctx.font = '600 32px Inter, sans-serif'
  ctx.fillText('Good taste deserves a track record.', W / 2, 1780)
  ctx.fillStyle = '#45C8FF'
  ctx.font = '800 34px Inter, sans-serif'
  ctx.fillText('tally-rho-ten.vercel.app', W / 2, 1835)

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/png')
  })
}
