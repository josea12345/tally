import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Category, Drop, PlaceSuggestion } from '../lib/types'
import { ALL_CATEGORIES, CATEGORY_LABELS, isPlaceCategory } from '../lib/types'
import { mapsUrlFor, mapsUrlForQuery } from '../lib/geo'
import { useDeviceLocation } from '../hooks/useLocation'
import { navigate } from '../App'
import PlaceAutocomplete from '../components/PlaceAutocomplete'
import MediaUpload, { type UploadedMedia } from '../components/MediaUpload'
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
  if (category === 'movies_tv') return { url: `https://www.imdb.com/find/?q=${encodeURIComponent(t)}`, label: 'IMDb' }
  if (category === 'music') return { url: `https://open.spotify.com/search/${encodeURIComponent(t)}`, label: 'Spotify' }
  return null
}

const MEDIA_PLACEHOLDER: Record<string, string> = {
  movies_tv: 'Movie or show title…',
  music: 'Song, album, or artist…',
}

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
  const [media, setMedia] = useState<UploadedMedia | null>(null)
  const [pinned, setPinned] = useState<PlaceSuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const { state: locState, effective, locate } = useDeviceLocation(profile?.city)

  const isPlace = isPlaceCategory(category)
  const origin = effective

  useEffect(() => {
    if (!user) return
    setCity((c) => c || profile?.city || 'Miami')
  }, [user, profile])

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
        if (d.media_url) setMedia({ url: d.media_url, type: d.media_type ?? 'photo' })
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
            mapsUrl: d.maps_url ?? mapsUrlFor(d.latitude, d.longitude),
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
        media_url: media?.url ?? null,
        media_type: media?.type ?? null,
        external_url: externalUrl,
        external_label: externalLabel,
        tip: tip.trim() || null,
        where_to: whereTo.trim() || null,
      }

      if (editId) {
        const { error: upErr } = await supabase.from('drops').update(row).eq('id', editId)
        if (upErr) throw upErr
        navigate(`/drop/${editId}`)
      } else {
        const { data, error: insErr } = await supabase.from('drops').insert(row).select('id').single()
        if (insErr) throw insErr
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

      <div className="mt-3">
        <MediaUpload userId={user.id} current={media} onUploaded={setMedia} onClear={() => setMedia(null)} />
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
