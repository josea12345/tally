import { describe, expect, it } from 'vitest'
import { parseHashString, safeDecode } from './routes'

describe('parseHashString — valid routes', () => {
  it('empty and root hashes are home', () => {
    expect(parseHashString('')).toEqual({ name: 'home' })
    expect(parseHashString('#')).toEqual({ name: 'home' })
    expect(parseHashString('#/')).toEqual({ name: 'home' })
  })

  it('parses every static route', () => {
    for (const name of [
      'create',
      'filter',
      'video',
      'camera',
      'saved',
      'search',
      'leaderboard',
      'notifications',
      'settings',
      'onboarding',
      'auth',
    ] as const) {
      expect(parseHashString(`#/${name}`)).toEqual({ name })
    }
  })

  it('parses parameterized routes', () => {
    expect(parseHashString('#/drop/abc-123')).toEqual({ name: 'drop', param: 'abc-123' })
    expect(parseHashString('#/edit/abc-123')).toEqual({ name: 'edit', param: 'abc-123' })
    expect(parseHashString('#/list/abc-123')).toEqual({ name: 'list', param: 'abc-123' })
    expect(parseHashString('#/followers/u1')).toEqual({ name: 'followers', param: 'u1' })
    expect(parseHashString('#/following/u1')).toEqual({ name: 'following', param: 'u1' })
    expect(parseHashString('#/profile')).toEqual({ name: 'profile' })
    expect(parseHashString('#/profile/jag')).toEqual({ name: 'profile', param: 'jag' })
    expect(parseHashString('#/topic/miami%20eats')).toEqual({ name: 'topic', param: 'miami eats' })
  })
})

describe('parseHashString — malformed routes never crash and fall back sanely', () => {
  it('missing params fall back to home (or the bare profile)', () => {
    expect(parseHashString('#/drop')).toEqual({ name: 'home' })
    expect(parseHashString('#/drop/')).toEqual({ name: 'home' })
    expect(parseHashString('#/list/')).toEqual({ name: 'home' })
    expect(parseHashString('#/edit/')).toEqual({ name: 'home' })
  })

  it('unknown routes go home', () => {
    expect(parseHashString('#/nope')).toEqual({ name: 'home' })
    expect(parseHashString('#/DROP/abc')).toEqual({ name: 'home' }) // case-sensitive on purpose
    expect(parseHashString('#//')).toEqual({ name: 'home' })
  })

  it('malformed percent-escapes do not throw (previously crashed the app)', () => {
    expect(() => parseHashString('#/profile/%')).not.toThrow()
    expect(() => parseHashString('#/profile/%E0%A4%A')).not.toThrow()
    expect(() => parseHashString('#/topic/%zz')).not.toThrow()
    // raw segment survives as the param instead of an exception
    expect(parseHashString('#/profile/%')).toEqual({ name: 'profile', param: '%' })
  })

  it('extra segments are ignored beyond the param', () => {
    expect(parseHashString('#/drop/abc/extra/deep')).toEqual({ name: 'drop', param: 'abc' })
  })

  it('invite-style query suffixes do not break routing', () => {
    expect(parseHashString('#/?ref=friend-code')).toEqual({ name: 'home' })
  })
})

describe('safeDecode', () => {
  it('decodes valid escapes and passes malformed ones through', () => {
    expect(safeDecode('a%20b')).toBe('a b')
    expect(safeDecode('%')).toBe('%')
    expect(safeDecode('%E0%A4%A')).toBe('%E0%A4%A')
    expect(safeDecode('plain')).toBe('plain')
  })
})
