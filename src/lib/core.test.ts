import { describe, expect, it } from 'vitest'
import { parseHashString } from './routes'
import { tasteScoreFor, trustScoreFor, winRateFor, WIN_RATE_MINIMUM } from './stats'
import { scaleFilterCss, textVisibleAt, type TextOverlay } from './filters'
import { cutEndAt, keptSeconds } from './video'
import { segmentPosition } from './sound'

describe('tasteScoreFor (Wilson lower bound)', () => {
  it('is 0 with no verdicts', () => {
    expect(tasteScoreFor(0, 0)).toBe(0)
  })
  it('more verdicts at the same rate always scores higher', () => {
    expect(tasteScoreFor(50, 50)).toBeGreaterThan(tasteScoreFor(5, 5))
    expect(tasteScoreFor(500, 500)).toBeGreaterThan(tasteScoreFor(50, 50))
  })
  it('a perfect record beats a losing one; output is bounded 0..100', () => {
    expect(tasteScoreFor(10, 0)).toBeGreaterThan(tasteScoreFor(0, 10))
    for (const [w, l] of [
      [0, 100],
      [100, 0],
      [3, 7],
    ] as const) {
      const s = tasteScoreFor(w, l)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

describe('winRateFor', () => {
  it('hides the rate below the verdict minimum but still counts', () => {
    const few = winRateFor([{ verdict: 'W' }, { verdict: 'W' }] as never)
    expect(few.total).toBe(2)
    expect(few.rate).toBeNull()
    const many = winRateFor(
      Array.from({ length: WIN_RATE_MINIMUM }, () => ({ verdict: 'W' })) as never,
    )
    expect(many.rate).toBe(1)
  })
})

describe('trustScoreFor', () => {
  it('returns null below the qualifying-drop minimum', () => {
    const t = trustScoreFor([{ score: 9, community: [9, 10] }], 10)
    expect(t.score).toBeNull()
    expect(t.qualifyingDrops).toBe(1)
  })
  it('perfect agreement scores high once qualified', () => {
    const t = trustScoreFor(
      [
        { score: 9, community: [9, 9] },
        { score: 8, community: [8, 8, 8] },
      ],
      100,
    )
    expect(t.score).not.toBeNull()
    expect(t.score!).toBeGreaterThan(80)
  })
  it('drops with fewer than 2 community ratings never qualify', () => {
    const t = trustScoreFor(
      [
        { score: 9, community: [9] },
        { score: 9, community: [] },
      ],
      0,
    )
    expect(t.score).toBeNull()
    expect(t.qualifyingDrops).toBe(0)
  })
})

describe('scaleFilterCss', () => {
  const css = 'brightness(1.4) contrast(1.2) saturate(1.6) sepia(0.5) hue-rotate(90deg) blur(2px)'
  it('intensity 1 returns the css unchanged', () => {
    expect(scaleFilterCss(css, 1)).toBe(css)
  })
  it('intensity 0 neutralizes every function', () => {
    const out = scaleFilterCss(css, 0)
    expect(out).toContain('brightness(1)')
    expect(out).toContain('contrast(1)')
    expect(out).toContain('saturate(1)')
    expect(out).toContain('sepia(0)')
    expect(out).toContain('hue-rotate(0deg)')
    expect(out).toContain('blur(0px)')
  })
  it('empty css stays empty', () => {
    expect(scaleFilterCss('', 0.5)).toBe('')
  })
})

describe('segmentPosition', () => {
  it('maps video time into the segment, looping', () => {
    const seg = { start: 10, end: 14 } // 4s segment
    expect(segmentPosition(seg, 0)).toBe(10)
    expect(segmentPosition(seg, 3)).toBe(13)
    expect(segmentPosition(seg, 4)).toBe(10)
    expect(segmentPosition(seg, 9)).toBe(11)
  })
  it('negative video time clamps to the segment start', () => {
    expect(segmentPosition({ start: 5, end: null }, -2)).toBe(5)
  })
  it('no segment means position 0', () => {
    expect(segmentPosition(null, 12)).toBe(0)
  })
  it('route parser stays wired (smoke)', () => {
    expect(parseHashString('#/drop/x').name).toBe('drop')
  })
})

describe('cutEndAt / keptSeconds (deleted takes)', () => {
  const cuts = [
    { start: 5, end: 10 },
    { start: 20, end: 22 },
  ]
  it('returns the cut end inside a cut, null outside', () => {
    expect(cutEndAt(cuts, 7)).toBe(10)
    expect(cutEndAt(cuts, 5)).toBe(10)
    expect(cutEndAt(cuts, 10)).toBeNull()
    expect(cutEndAt(cuts, 3)).toBeNull()
    expect(cutEndAt(undefined, 7)).toBeNull()
  })
  it('keptSeconds subtracts only the overlap', () => {
    expect(keptSeconds(0, 30, cuts)).toBe(23)
    expect(keptSeconds(0, 6, cuts)).toBe(5)
    expect(keptSeconds(12, 18, cuts)).toBe(6)
    expect(keptSeconds(0, 30, undefined)).toBe(30)
  })
})

describe('textVisibleAt (timed overlays)', () => {
  const base: TextOverlay = { id: 'x', text: 'hi', x: 0.5, y: 0.5, color: '#fff', scale: 1 }
  it('untimed text is always visible', () => {
    expect(textVisibleAt(base, 0)).toBe(true)
    expect(textVisibleAt(base, 42)).toBe(true)
  })
  it('windowed text shows only inside [start, end]', () => {
    const t = { ...base, start: 2, end: 5 }
    expect(textVisibleAt(t, 1.9)).toBe(false)
    expect(textVisibleAt(t, 2)).toBe(true)
    expect(textVisibleAt(t, 5)).toBe(true)
    expect(textVisibleAt(t, 5.1)).toBe(false)
  })
  it('null end means until the clip ends', () => {
    const t = { ...base, start: 3, end: null }
    expect(textVisibleAt(t, 2)).toBe(false)
    expect(textVisibleAt(t, 99)).toBe(true)
  })
})
