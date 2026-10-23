import { describe, expect, it } from 'vitest'
import { parseHashString } from './routes'
import { ratingSummaryFor, tasteScoreFor, trustScoreFor } from './stats'
import { parseScoreInput, RATINGS_MINIMUM } from './ratings'
import { scaleFilterCss, textVisibleAt, type TextOverlay } from './filters'
import { cutEndAt, keptSeconds } from './video'
import { segmentPosition } from './sound'

describe('tasteScoreFor (credibility-weighted average)', () => {
  it('is 0 with no ratings', () => {
    expect(tasteScoreFor([])).toBe(0)
  })
  it('more ratings at the same high average always scores higher', () => {
    const five = Array.from({ length: 5 }, () => 9)
    const fifty = Array.from({ length: 50 }, () => 9)
    expect(tasteScoreFor(fifty)).toBeGreaterThan(tasteScoreFor(five))
  })
  it('a couple of friendly 10s cannot crown anyone', () => {
    const two = tasteScoreFor([10, 10])
    const proven = tasteScoreFor(Array.from({ length: 200 }, () => 10))
    expect(two).toBeLessThan(proven)
    expect(proven).toBeLessThanOrEqual(100)
    expect(two).toBeGreaterThanOrEqual(0)
  })
  it('a low average sinks further as volume confirms it', () => {
    const five = Array.from({ length: 5 }, () => 5)
    const fifty = Array.from({ length: 50 }, () => 5)
    expect(tasteScoreFor(fifty)).toBeLessThan(tasteScoreFor(five))
  })
})

describe('ratingSummaryFor', () => {
  it('gates the public score on the ratings minimum but still counts', () => {
    const few = ratingSummaryFor([10, 9.5])
    expect(few.count).toBe(2)
    expect(few.enough).toBe(false)
    expect(few.peaks).toBe(1)
    const many = ratingSummaryFor(Array.from({ length: RATINGS_MINIMUM }, () => 8.4))
    expect(many.enough).toBe(true)
    expect(many.avg).toBeCloseTo(8.4)
  })
})

describe('parseScoreInput (typed scores)', () => {
  it('parses plain and decimal scores', () => {
    expect(parseScoreInput('8.3')).toBe(8.3)
    expect(parseScoreInput('8')).toBe(8)
    expect(parseScoreInput('10')).toBe(10)
    expect(parseScoreInput('10.0')).toBe(10)
    expect(parseScoreInput('0')).toBe(0)
    expect(parseScoreInput('0.4')).toBe(0.4)
  })
  it('reads bare integers 11-100 as tenths (the skipped-dot case)', () => {
    expect(parseScoreInput('83')).toBe(8.3)
    expect(parseScoreInput('85')).toBe(8.5)
    expect(parseScoreInput('100')).toBe(10)
  })
  it('rounds extra precision to one decimal', () => {
    expect(parseScoreInput('7.55')).toBe(7.6)
    expect(parseScoreInput('7.54')).toBe(7.5)
  })
  it('rejects out-of-range and garbage', () => {
    expect(parseScoreInput('10.5')).toBeNull()
    expect(parseScoreInput('abc')).toBeNull()
    expect(parseScoreInput('')).toBeNull()
    expect(parseScoreInput('-3')).toBeNull()
    expect(parseScoreInput('1.2.3')).toBeNull()
    expect(parseScoreInput('.')).toBeNull()
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
