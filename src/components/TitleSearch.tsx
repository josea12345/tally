import { useEffect, useState } from 'react'
import { searchTmdb, tmdbEnabled, type TmdbTitle } from '../lib/tmdb'

/**
 * TMDB title search for the composer (movies / TV). Picking a title fills the
 * drop title, attaches the poster as the cover, and links the TMDB page.
 * Renders nothing when no API key is configured — manual entry still works.
 */
export default function TitleSearch({
  category,
  onPick,
}: {
  category: 'movies' | 'tv'
  onPick: (t: TmdbTitle) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<TmdbTitle[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchTmdb(q, category === 'movies' ? 'movie' : 'tv')
      setResults(r)
      setSearching(false)
      setOpen(true)
    }, 400)
    return () => clearTimeout(t)
  }, [q, category])

  if (!tmdbEnabled) return null

  return (
    <div className="relative mb-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={category === 'movies' ? 'Search movies…' : 'Search TV shows…'}
        className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-3.5 text-base font-bold outline-none placeholder:text-mute/60 focus:border-sig"
      />
      {open && (
        <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-line bg-ink-3 shadow-2xl">
          {searching && <p className="px-4 py-3 text-sm text-mute">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-mute">No matches — just type the title below.</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onPick(r)
                setOpen(false)
                setQ('')
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-ink-2"
            >
              {r.posterUrl ? (
                <img src={r.posterUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" loading="lazy" />
              ) : (
                <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-ink-2 text-xs text-mute">
                  ?
                </div>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {r.title} {r.year && <span className="font-normal text-mute">({r.year})</span>}
                </span>
                <span className="block truncate text-xs text-mute">{r.overview || 'TMDB'}</span>
              </span>
            </button>
          ))}
          <p className="border-t border-line px-4 py-2 text-[10px] text-mute/70">
            Title data by TMDB — not endorsed by TMDB.
          </p>
        </div>
      )}
    </div>
  )
}
