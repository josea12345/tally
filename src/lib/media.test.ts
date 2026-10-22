import { describe, expect, it } from 'vitest'
import { dropMediaKeys, storageKeyFromUrl } from './media'

const BASE = 'https://jbeljczivhiwkuylfvdf.supabase.co/storage/v1/object/public'

describe('storageKeyFromUrl', () => {
  it('parses a drop-media public URL', () => {
    expect(storageKeyFromUrl(`${BASE}/drop-media/user1/abc-123.mp4`)).toEqual({
      bucket: 'drop-media',
      path: 'user1/abc-123.mp4',
    })
  })

  it('parses an avatars URL and strips query strings', () => {
    expect(storageKeyFromUrl(`${BASE}/avatars/user1/avatar.jpg?t=42`)).toEqual({
      bucket: 'avatars',
      path: 'user1/avatar.jpg',
    })
  })

  it('decodes percent-encoded paths', () => {
    expect(storageKeyFromUrl(`${BASE}/drop-media/user1/my%20clip.mp4`)).toEqual({
      bucket: 'drop-media',
      path: 'user1/my clip.mp4',
    })
  })

  it('ignores non-storage URLs', () => {
    expect(storageKeyFromUrl('https://image.tmdb.org/t/p/w500/poster.jpg')).toBeNull()
    expect(storageKeyFromUrl('https://example.com/storage/other/x.jpg')).toBeNull()
    expect(storageKeyFromUrl('')).toBeNull()
  })
})

describe('dropMediaKeys', () => {
  it('collects media + posters and dedupes repeats', () => {
    const keys = dropMediaKeys({
      media_url: `${BASE}/drop-media/u/a.mp4`,
      media_urls: [`${BASE}/drop-media/u/a.mp4`, `${BASE}/drop-media/u/b.jpg`],
      media_poster_url: `${BASE}/drop-media/u/a-poster.jpg`,
      media_poster_urls: [null, `${BASE}/drop-media/u/b-poster.jpg`],
    })
    expect(keys).toEqual([
      { bucket: 'drop-media', path: 'u/a.mp4' },
      { bucket: 'drop-media', path: 'u/b.jpg' },
      { bucket: 'drop-media', path: 'u/a-poster.jpg' },
      { bucket: 'drop-media', path: 'u/b-poster.jpg' },
    ])
  })

  it('skips external media URLs', () => {
    const keys = dropMediaKeys({
      media_url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      media_urls: [],
      media_poster_url: null,
      media_poster_urls: [],
    })
    expect(keys).toEqual([])
  })
})
