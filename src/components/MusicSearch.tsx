import { useEffect, useState } from 'react'
import { searchMusic, type MusicKind, type MusicTrack } from '../lib/music'

const KIND_OPTIONS: { kind: MusicKind; label: string; placeholder: string }[] = [
  { kind: 'track', label: 'Songs', placeholder: 'Search songs…' },
  { kind: 'album', label: 'Albums', placeholder: 'Search albums…' },
  { kind: 'artist', label: 'Artists', placeholder: 'Search artists…' },
]

/**
 * Track search for the composer (music), backed by Deezer via the
 * music-search edge function. Search matches artist, song and album.
 * Picking a track fills the drop title, attaches the album art as the
 * cover, and links the track — the music mirror of the TMDB title
 * search. The box always renders; if search fails it says so inline
 * and manual entry still works.
 */
export default function MusicSearch({ onPick }: { onPick: (t: MusicTrack) => void }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<MusicKind>('track')
  const [results, setResults] = useState<MusicTrack[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await searchMusic(q, kind)
        setResults(r)
        setFailed(false)
      } catch {
        setResults([])
        setFailed(true)
      } finally {
        setSearching(false)
        setOpen(true)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [q, kind])

  return (
    <div className="relative mb-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={KIND_OPTIONS.find((o) => o.kind === kind)?.placeholder}
        className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-3.5 text-base font-bold outline-none placeholder:text-mute/60 focus:border-sig"
      />
      <div className="mt-2 flex gap-1.5">
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            onClick={() => setKind(o.kind)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-black transition ${
              kind === o.kind ? 'bg-sig text-ink' : 'border border-line bg-ink-2 text-mute'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {open && (
        <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-line bg-ink-3 shadow-2xl">
          {searching && <p className="px-4 py-3 text-sm text-mute">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-mute">
              {failed
                ? 'Search hiccup — check your connection, or just type the title below.'
                : 'No matches — just type the title below.'}
            </p>
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
              {r.image ? (
                <img src={r.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-2 text-xs text-mute">
                  ?
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{r.name}</span>
                <span className="block truncate text-xs text-mute">
                  {[r.artists, r.album].filter(Boolean).join(' · ')}
                </span>
              </span>
              {r.popularity != null && (
                <span className="shrink-0 rounded-full bg-ink-2 px-2 py-1 text-[10px] font-black text-mute">
                  {r.popularity}
                </span>
              )}
            </button>
          ))}
          <p className="border-t border-line px-4 py-2 text-[10px] text-mute/70">
            Track data by Deezer — not endorsed by Deezer.
          </p>
        </div>
      )}
    </div>
  )
}
