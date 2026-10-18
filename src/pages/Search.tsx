import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, Profile } from '../lib/types'
import { dropMedia } from '../lib/types'
import { Avatar, navigate } from '../App'
import FollowButton from '../components/FollowButton'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'

type Tab = 'people' | 'drops'

interface DropHit extends Pick<Drop, 'id' | 'title' | 'description' | 'score' | 'created_at' | 'media_urls' | 'media_types' | 'media_poster_urls' | 'media_type' | 'media_poster_url' | 'media_url'> {
  author: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null
}

export default function Search() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [tab, setTab] = useState<Tab>('people')
  const [people, setPeople] = useState<Profile[]>([])
  const [drops, setDrops] = useState<DropHit[]>([])
  const [fresh, setFresh] = useState<DropHit[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  // Fresh drops when there's no query
  useEffect(() => {
    if (debounced) return
    let live = true
    supabase
      .from('drops')
      .select('id, title, description, score, created_at, media_urls, media_types, media_poster_urls, media_type, media_poster_url, media_url, author:profiles(username, display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (live) setFresh((data ?? []) as DropHit[])
      })
    return () => {
      live = false
    }
  }, [debounced])

  useEffect(() => {
    let live = true
    const run = async () => {
      if (!debounced) {
        setPeople([])
        setDrops([])
        return
      }
      setBusy(true)
      const like = `%${debounced.replace(/[%_]/g, '')}%`
      const [pr, dr] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .or(`username.ilike.${like},display_name.ilike.${like}`)
          .limit(20),
        supabase
          .from('drops')
          .select('id, title, description, score, created_at, media_urls, media_types, media_poster_urls, media_type, media_poster_url, media_url, author:profiles(username, display_name, avatar_url)')
          .or(`title.ilike.${like},description.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      if (!live) return
      setPeople(((pr.data ?? []) as Profile[]).filter((p) => p.id !== user?.id))
      setDrops((dr.data ?? []) as DropHit[])
      setBusy(false)
    }
    run()
    return () => {
      live = false
    }
  }, [debounced, user])

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="mb-3 text-2xl font-black tracking-tight">Search</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="People, places, drops…"
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full rounded-full border border-line bg-ink-2 px-4 py-2.5 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
        />
        {debounced && (
          <div className="mt-3 flex gap-2">
            {(['people', 'drops'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-black capitalize transition ${
                  tab === t ? 'bg-lime text-ink' : 'border border-line text-mute'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {!debounced ? (
        <div className="px-4 pt-4">
          <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Fresh drops</h2>
          {fresh.length === 0 ? (
            <p className="text-sm text-mute">Nothing dropped yet — be the first.</p>
          ) : (
            <ul className="space-y-2.5">
              {fresh.map((d) => (
                <DropRow key={d.id} drop={d} />
              ))}
            </ul>
          )}
        </div>
      ) : busy ? (
        <div className="animate-pulse space-y-3 px-4 py-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-ink-3" />
          ))}
        </div>
      ) : tab === 'people' ? (
        <div className="px-4 pt-4">
          {people.length === 0 ? (
            <EmptyState title="No people found" body={`Nobody matches "${debounced}" yet.`} />
          ) : (
            <ul className="space-y-3">
              {people.map((p) => (
                <PersonRow key={p.id} profile={p} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="px-4 pt-4">
          {drops.length === 0 ? (
            <EmptyState title="No drops found" body={`Nothing matches "${debounced}" yet.`} />
          ) : (
            <ul className="space-y-2.5">
              {drops.map((d) => (
                <DropRow key={d.id} drop={d} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function PersonRow({ profile: p }: { profile: Profile }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 p-3">
      <button onClick={() => navigate(`/profile/${p.id}`)}>
        <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={44} />
      </button>
      <button onClick={() => navigate(`/profile/${p.id}`)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-bold">
          {p.display_name || `@${p.username}`}{' '}
          <span className="font-normal text-mute">@{p.username}</span>
        </div>
        {p.bio && <div className="truncate text-xs text-mute">{p.bio}</div>}
      </button>
      <FollowButton followeeId={p.id} />
    </li>
  )
}

function DropRow({ drop: d }: { drop: DropHit }) {
  const first = dropMedia(d)[0]
  const thumb = first ? (first.type === 'video' ? first.posterUrl || undefined : first.url) : undefined
  return (
    <li>
      <button
        onClick={() => navigate(`/drop/${d.id}`)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-ink-2 p-2.5 text-left transition hover:border-lime/50"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-black object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-lg">📍</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{d.title}</span>
          <span className="block truncate text-xs text-mute">
            @{d.author?.username ?? '?'} · {timeAgo(d.created_at)}
            {d.score != null && <span className="font-bold text-lime"> · {d.score}/10</span>}
          </span>
        </span>
      </button>
    </li>
  )
}
