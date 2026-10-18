import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Category, Drop, PlaceSuggestion } from '../lib/types'
import { ALL_CATEGORIES, CATEGORY_LABELS, MAX_CAROUSEL_ITEMS, dropMedia, isPlaceCategory } from '../lib/types'
import { mapsUrlForPlace, mapsUrlForQuery } from '../lib/geo'
import { useDeviceLocation } from '../hooks/useLocation'
import { navigate } from '../App'
import PlaceAutocomplete from '../components/PlaceAutocomplete'
import MediaUpload, { type UploadedMedia } from '../components/MediaUpload'
import TitleSearch from '../components/TitleSearch'
import type { TmdbTitle } from '../lib/tmdb'
import { takePendingUpload, getDraftMedia, setDraftMedia, clearDraftMedia } from '../lib/pendingMedia'
import EmptyState from '../components/EmptyState'

type LinkKind = 'auto' | 'paste' | 'none'

const AUTO_LABEL: Record<string, 'IMDb' | 'Rotten Tomatoes' | 'Spotify'> = {
  movies: 'IMDb',
  tv: 'Rotten Tomatoes',
  music: 'Spotify',
}

function autoLink(category: Category, title: string): { url: string; label: 'IMDb' | 'Rotten Tomatoes' | 'Spotify' } | null {
  const t = title.trim()
  if (!t) return null
  if (category === 'movies' || category === 'tv') return { url: `https://www.imdb.com/find/?q=${encodeURIComponent(t)}`, label: 'IMDb' }
  if (category === 'music') return { url: `https://open.spotify.com/search/${encodeURIComponent(t)}`, label: 'Spotify' }
  return null
}

const MEDIA_PLACEHOLDER: Record<string, string> = {
  movies: 'Movie title…',
  tv: 'Show title…',
  music: 'Song, album, or artist…',
  recipes: 'Dish name…',
}

const parseLines = (s: string): string[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

export default function Composer({ editId }: { editId?: string }) {
  const { user, profile } = useAuth()
  const [category, setCategory] = useState<Category>('food_drink')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tip, setTip] = useState('')
  const [whereTo, setWhereTo] = useState('')
  const [city, setCity] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [linkKind, setLinkKind] = useState<LinkKind>('auto')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [mediaList, setMediaList] = useState<UploadedMedia[]>([])
  const [ingredientsText, setIngredientsText] = useState('')
  const [instructionsText, setInstructionsText] = useState('')
  const [pinned, setPinned] = useState<PlaceSuggestion | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [tmdbUrl, setTmdbUrl] = useState<string | null>(null)
  const [tmdbPoster, setTmdbPoster] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** TMDB title pick: fill the title, attach the poster as cover, link the TMDB page. */
  const pickTitle = (t: TmdbTitle) => {
    setTitle(t.year ? `${t.title} (${t.year})` : t.title)
    setTmdbUrl(t.tmdbUrl)
    setMediaList((prev) => {
      const withoutOld = tmdbPoster ? prev.filter((m) => m.url !== tmdbPoster) : prev
      if (!t.posterUrl || withoutOld.some((m) => m.url === t.posterUrl)) return withoutOld
      return [{ url: t.posterUrl, type: 'photo' as const }, ...withoutOld]
    })
    setTmdbPoster(t.posterUrl)
  }
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const { state: locState, effective, locate } = useDeviceLocation(profile?.city)

  const isPlace = isPlaceCategory(category)
  const origin = effective

  useEffect(() => {
    if (!user) return
    setCity((c) => c || profile?.city || 'Miami')
  }, [user, profile])

  // Camera flow: a filtered photo or trimmed clip waiting from the camera screens.
  // Appended to the draft so the carousel survives the camera round-trip.
  useEffect(() => {
    if (editId) return
    const draft = getDraftMedia()
    const p = takePendingUpload()
    const next = [...draft]
    if (p) {
      next.push({ url: p.url, type: p.type, posterUrl: p.posterUrl })
    }
    if (next.length > 0) setMediaList(next.slice(0, MAX_CAROUSEL_ITEMS))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  // Draft autosave: keeps attached media across the camera round-trip (which remounts).
  useEffect(() => {
    if (editId) return
    setDraftMedia(mediaList)
  }, [mediaList, editId])

  // Edit mode: load the drop.
  useEffect(() => {
    if (!editId || !user) return
    let live = true
    supabase
      .from('drops')
      .select('*')
      .eq('id', editId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!live) return
        if (e || !data) {
          setNotFound(true)
          return
        }
        const d = data as Drop
        if (d.author_id !== user.id) {
          setNotFound(true)
          return
        }
        setCategory(d.category)
        setTitle(d.title)
        setDescription(d.description)
        setTip(d.tip ?? '')
        setWhereTo(d.where_to ?? '')
        setCity(d.city ?? '')
        setSiteUrl(d.external_label === 'Official site' ? (d.external_url ?? '') : '')
        setPasteUrl(d.external_label && d.external_label !== 'Official site' ? (d.external_url ?? '') : '')
        setLinkKind(d.external_url ? (d.external_label === 'Official site' ? 'none' : 'paste') : 'auto')
        if (d.external_label === 'TMDB') setTmdbUrl(d.external_url)
        if (d.media_url || (d.media_urls?.length ?? 0) > 0) {
          setMediaList(
            dropMedia(d).map((m) => ({ url: m.url, type: m.type, posterUrl: m.posterUrl ?? undefined })),
          )
        }
        if (d.score != null) setScore(d.score)
        if ((d.ingredients?.length ?? 0) > 0) setIngredientsText(d.ingredients.join('\n'))
        if ((d.instructions?.length ?? 0) > 0) setInstructionsText(d.instructions.join('\n'))
        if (d.latitude != null && d.longitude != null) {
          setPinned({
            id: 'pinned',
            name: d.title,
            type: '',
            streetAddress: d.street_address,
            neighborhood: d.neighborhood,
            city: d.city,
            state: null,
            latitude: d.latitude,
            longitude: d.longitude,
            distanceKm: null,
            mapsUrl: mapsUrlForPlace(d.title, d.street_address, d.city),
            source: 'photon',
          })
        }
      })
    return () => {
      live = false
    }
  }, [editId, user])

  // Switching to a media category clears any pinned place.
  useEffect(() => {
    if (!isPlace) setPinned(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const pickPlace = (s: PlaceSuggestion) => {
    setPinned(s)
    setTitle(s.name)
    setCity(s.city ?? city)
  }

  const canPost = title.trim().length > 0 && description.trim().length > 0 && !busy

  const submit = async () => {
    if (!user || !canPost) return
    setError(null)
    setBusy(true)
    try {
      let externalUrl: string | null = null
      let externalLabel: Drop['external_label'] = null
      if (isPlace) {
        if (siteUrl.trim()) {
          externalUrl = siteUrl.trim()
          externalLabel = 'Official site'
        }
      } else if (tmdbUrl && (category === 'movies' || category === 'tv')) {
        externalUrl = tmdbUrl
        externalLabel = 'TMDB'
      } else if (linkKind === 'paste' && pasteUrl.trim()) {
        externalUrl = pasteUrl.trim()
        externalLabel = AUTO_LABEL[category] ?? null
      } else if (linkKind === 'auto') {
        const a = autoLink(category, title)
        if (a) {
          externalUrl = a.url
          externalLabel = a.label
        }
      }

      const mapsUrl = pinned
        ? pinned.mapsUrl
        : isPlace
          ? mapsUrlForQuery(`${title.trim()} ${city.trim()}`)
          : null

      const row = {
        author_id: user.id,
        category,
        title: title.trim(),
        description: description.trim(),
        city: city.trim() || null,
        neighborhood: pinned?.neighborhood ?? null,
        street_address: pinned?.streetAddress ?? null,
        latitude: pinned?.latitude ?? null,
        longitude: pinned?.longitude ?? null,
        maps_url: mapsUrl,
        media_urls: mediaList.map((m) => m.url),
        media_types: mediaList.map((m) => m.type),
        media_poster_urls: mediaList.map((m) => m.posterUrl ?? null),
        ingredients: category === 'recipes' ? parseLines(ingredientsText) : [],
        instructions: category === 'recipes' ? parseLines(instructionsText) : [],
        external_url: externalUrl,
        external_label: externalLabel,
        tip: tip.trim() || null,
        where_to: whereTo.trim() || null,
        score,
      }

      if (editId) {
        const { error: upErr } = await supabase.from('drops').update(row).eq('id', editId)
        if (upErr) throw upErr
        navigate(`/drop/${editId}`)
      } else {
        const { data, error: insErr } = await supabase.from('drops').insert(row).select('id').single()
        if (insErr) throw insErr
        clearDraftMedia()
        navigate(`/drop/${(data as { id: string }).id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your drop.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return <EmptyState title="Log in to drop" body="You need an account to put people on." action={
      <button onClick={() => navigate('/auth')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
        Log in
      </button>
    } />
  }

  if (editId && notFound) {
    return <EmptyState title="Drop not found" body="You can only edit your own drops." action={
      <button onClick={() => navigate('/')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
        Back to Discover
      </button>
    } />
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-10 pt-5">
      <h1 className="mb-1 text-3xl font-black tracking-tight">Let me put you on</h1>
      <p className="mb-5 text-sm text-mute">Drop something worth knowing. Keep it real — your record is on the line.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              category === c ? 'bg-lime text-ink' : 'border border-line bg-ink-2 text-mute hover:text-fog'
            }`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {(category === 'movies' || category === 'tv') && (
        <TitleSearch category={category} onPick={pickTitle} />
      )}
      {isPlace ? (
        <PlaceAutocomplete
          category={category}
          origin={origin}
          originLabel={effective.label}
          value={title}
          onChange={setTitle}
          onSelect={pickPlace}
          pinned={pinned}
          onUnpin={() => setPinned(null)}
        />
      ) : (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={MEDIA_PLACEHOLDER[category]}
          className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-4 text-lg font-bold outline-none placeholder:text-mute/60 focus:border-lime"
        />
      )}

      {category === 'recipes' && (
        <>
          <div className="mt-3 rounded-2xl border border-line bg-ink-2 p-4">
            <label className="mb-1 block text-xs font-black uppercase tracking-widest text-lime">
              Ingredients <span className="text-mute/60">— one per line</span>
            </label>
            <textarea
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder={'2 cups flour\n1 tsp salt\n3 eggs…'}
              rows={4}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-mute/60"
            />
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-ink-2 p-4">
            <label className="mb-1 block text-xs font-black uppercase tracking-widest text-lime">
              Steps <span className="text-mute/60">— one per line</span>
            </label>
            <textarea
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder={'Mix the dry ingredients…\nFold in the eggs…'}
              rows={4}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-mute/60"
            />
          </div>
        </>
      )}

      <div className="mt-3 rounded-2xl border border-line bg-ink-2 p-4">
        <label className="mb-1 block text-xs font-black uppercase tracking-widest text-lime">Hear me out —</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why is it worth knowing? Say it like you'd tell a friend."
          rows={3}
          maxLength={600}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-mute/60"
        />
        <div className="text-right text-[11px] text-mute">{description.length}/600</div>
      </div>

      <div className="mt-3 rounded-2xl border border-line bg-ink-2 p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <label className="text-xs font-black uppercase tracking-widest text-mute">Your call <span className="text-mute/60">(optional)</span></label>
          {score != null && (
            <button onClick={() => setScore(null)} className="text-[11px] font-bold text-mute hover:text-miss">
              Clear
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              onClick={() => setScore(n)}
              className={`h-10 w-10 shrink-0 rounded-full text-sm font-black transition ${
                score === n ? 'bg-lime text-ink' : 'border border-line bg-ink-3 text-mute hover:text-fog'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-mute">Calling your shot: how hard are you putting people on?</p>
      </div>

      <div className="mt-3">
        <MediaUpload
          userId={user.id}
          items={mediaList}
          onAdd={(added) => setMediaList((m) => [...m, ...added].slice(0, MAX_CAROUSEL_ITEMS))}
          onRemove={(i) => setMediaList((m) => m.filter((_, j) => j !== i))}
        />
      </div>

      <button
        onClick={() => setDetailsOpen((o) => !o)}
        className="mt-4 flex w-full items-center justify-between py-2 text-sm font-black text-lime"
      >
        Add details <span>{detailsOpen ? '▴' : '▾'}</span>
      </button>

      {detailsOpen && (
        <div className="rise-in space-y-3 rounded-2xl border border-line bg-ink-2 p-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-mute">Trust me: <span className="font-normal">(tip — what to order, when to go)</span></label>
            <input
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="Get the… / go at…"
              maxLength={200}
              className="w-full rounded-xl border border-line bg-ink-3 px-3 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
            />
          </div>
          {!isPlace && (
            <div>
              <label className="mb-1 block text-xs font-bold text-mute">
                {category === 'music' ? 'Where to listen' : 'Where to watch'}
              </label>
              <input
                value={whereTo}
                onChange={(e) => setWhereTo(e.target.value)}
                placeholder={category === 'music' ? 'Spotify, vinyl…' : 'Netflix, theaters…'}
                maxLength={120}
                className="w-full rounded-xl border border-line bg-ink-3 px-3 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
              />
            </div>
          )}
          {isPlace ? (
            <div>
              <label className="mb-1 block text-xs font-bold text-mute">Official site (optional)</label>
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                className="w-full rounded-xl border border-line bg-ink-3 px-3 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
              />
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-xs font-bold text-mute">
                Listen on — {AUTO_LABEL[category]}
              </label>
              <div className="flex gap-2">
                {(['auto', 'paste'] as LinkKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setLinkKind(k)}
                    className={`flex-1 rounded-full py-2 text-xs font-black transition ${
                      linkKind === k ? 'bg-lime text-ink' : 'border border-line text-mute'
                    }`}
                  >
                    {k === 'auto' ? `${AUTO_LABEL[category]} (automatic)` : 'Paste a link'}
                  </button>
                ))}
              </div>
              {linkKind === 'paste' ? (
                <input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  className="mt-2 w-full rounded-xl border border-line bg-ink-3 px-3 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
                />
              ) : (
                <p className="mt-2 text-xs text-mute">
                  Nothing to paste — we'll link your title on {AUTO_LABEL[category]} automatically.
                </p>
              )}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-bold text-mute">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Miami"
              maxLength={60}
              className="w-full rounded-xl border border-line bg-ink-3 px-3 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
            />
          </div>
        </div>
      )}

      {locState.status === 'off' && (
        <button onClick={locate} className="mt-3 text-xs font-bold text-lime hover:underline">
          ◉ Use my precise location for suggestions
        </button>
      )}

      {error && <p className="mt-3 text-sm font-bold text-miss">{error}</p>}

      <button
        onClick={submit}
        disabled={!canPost}
        className="mt-5 w-full rounded-full bg-lime py-4 text-base font-black text-ink transition hover:bg-lime-dim disabled:opacity-40"
      >
        {busy ? 'Posting…' : editId ? 'Save changes' : 'Post — put everyone on'}
      </button>
      {!canPost && (
        <p className="mt-2 text-center text-xs text-mute">Add a {isPlace ? 'place name' : 'title'} and one line on why it's worth it.</p>
      )}
    </div>
  )
}
