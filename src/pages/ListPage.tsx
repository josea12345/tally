import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Collection, Drop, Profile } from '../lib/types'
import { dropMedia } from '../lib/types'
import { Avatar, navigate } from '../App'
import DropGrid from '../components/DropGrid'
import EmptyState from '../components/EmptyState'

/**
 * A collection's page: the drops in it (drop visibility still applies,
 * so a private author's drop never leaks through a public list), with
 * owner controls for rename, public/private, share and delete.
 */
export default function ListPage({ id }: { id: string }) {
  const { user } = useAuth()
  const [col, setCol] = useState<(Collection & { owner?: Profile | null }) | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [managing, setManaging] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [sharedNote, setSharedNote] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isOwner = !!user && !!col && user.id === col.owner_id

  const load = async () => {
    const { data: c } = await supabase
      .from('collections')
      .select('*, owner:profiles(*)')
      .eq('id', id)
      .maybeSingle()
    if (!c) {
      setMissing(true)
      setLoading(false)
      return
    }
    const collection = c as Collection & { owner?: Profile | null }
    setCol(collection)
    setName(collection.name)
    const { data: items } = await supabase
      .from('collection_items')
      .select('added_at, drop:drops!collection_items_drop_id_fkey(*, author:profiles!drops_author_id_fkey(*))')
      .eq('collection_id', id)
      .order('added_at', { ascending: false })
      .limit(200)
    const list = ((items ?? []) as unknown as Array<{ drop: Drop | null }>)
      .map((i) => i.drop)
      .filter((d): d is Drop => !!d)
    setDrops(list)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const removeItem = async (dropId: string) => {
    if (!isOwner) return
    const { error } = await supabase
      .from('collection_items')
      .delete()
      .eq('collection_id', id)
      .eq('drop_id', dropId)
    if (!error) setDrops((prev) => prev.filter((d) => d.id !== dropId))
  }

  const saveRename = async () => {
    const n = name.trim()
    if (!n || !col) return
    const { error } = await supabase.from('collections').update({ name: n }).eq('id', id)
    if (!error) {
      setCol({ ...col, name: n })
      setRenaming(false)
    }
  }

  const togglePublic = async () => {
    if (!col) return
    const next = !col.is_public
    const { error } = await supabase.from('collections').update({ is_public: next }).eq('id', id)
    if (!error) setCol({ ...col, is_public: next })
  }

  const deleteList = async () => {
    const { error } = await supabase.from('collections').delete().eq('id', id)
    if (!error) navigate('/saved')
  }

  const share = async () => {
    const url = `${window.location.origin}/#/list/${id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: col?.name ?? 'TALLY list', url })
        return
      }
      throw new Error('no native share')
    } catch {
      try {
        await navigator.clipboard.writeText(url)
        setSharedNote(true)
        setTimeout(() => setSharedNote(false), 1600)
      } catch {
        // clipboard unavailable — nothing sensible to fall back to
      }
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 px-4 py-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-ink-3" />
        ))}
      </div>
    )
  }

  if (missing || !col) {
    return (
      <EmptyState
        title="List not found"
        body="It may be private, or it doesn't exist anymore."
        mood="sleepy"
        action={
          <button onClick={() => navigate('/')} className="btn-pop press px-6 py-2.5 text-sm">
            Back to Put Ons
          </button>
        }
      />
    )
  }

  return (
    <div className="pb-10">
      <div className="px-4 pt-5">
        <button onClick={() => navigate('/saved')} className="text-sm font-bold text-mute transition hover:text-sig">
          ← Tallies
        </button>
        {renaming ? (
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              className="min-w-0 flex-1 rounded-full border border-line bg-ink-2 px-4 py-2 text-base font-bold outline-none focus:border-sig"
            />
            <button onClick={saveRename} className="shrink-0 rounded-full bg-sig px-4 py-2 text-sm font-black text-ink">
              Save
            </button>
            <button
              onClick={() => {
                setName(col.name)
                setRenaming(false)
              }}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-bold text-mute"
            >
              Cancel
            </button>
          </div>
        ) : (
          <h1 className="mt-3 text-2xl font-black tracking-tight">{col.name}</h1>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-sm text-mute">
          {col.owner && (
            <button onClick={() => navigate(`/profile/${col.owner_id}`)} className="flex items-center gap-1.5 font-bold text-fog">
              <Avatar url={col.owner.avatar_url} name={col.owner.display_name ?? col.owner.username} size={20} />@
              {col.owner.username}
            </button>
          )}
          <span>· {drops.length} drop{drops.length === 1 ? '' : 's'}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${col.is_public ? 'bg-sig/15 text-sig' : 'bg-ink-3 text-mute'}`}>
            {col.is_public ? 'Public' : 'Private'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={share} className="rounded-full bg-sig px-4 py-2 text-sm font-black text-ink">
            {sharedNote ? 'Link copied!' : 'Share list'}
          </button>
          {isOwner && (
            <>
              <button onClick={() => setManaging((m) => !m)} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-fog">
                {managing ? 'Done' : 'Manage'}
              </button>
              <button onClick={() => setRenaming(true)} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-fog">
                Rename
              </button>
              <button onClick={togglePublic} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-fog">
                Make {col.is_public ? 'private' : 'public'}
              </button>
              {confirmDelete ? (
                <button onClick={deleteList} className="rounded-full bg-miss px-4 py-2 text-sm font-black text-white">
                  Tap again to delete the list
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-miss">
                  Delete list
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-5">
        {drops.length === 0 ? (
          <p className="px-4 text-sm text-mute">
            Nothing in this list yet — add drops from any post's ··· menu ("Add to list…").
          </p>
        ) : managing && isOwner ? (
          <ul className="space-y-2 px-4">
            {drops.map((d) => {
              const cover = dropMedia(d)[0]
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 p-2.5">
                  {cover ? (
                    <img
                      src={cover.type === 'video' ? cover.posterUrl ?? '' : cover.url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl bg-black object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-sm font-black text-sig">
                      {d.score ?? '•'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{d.title}</span>
                    <span className="block text-xs text-mute">@{d.author?.username ?? '?'}</span>
                  </span>
                  <button
                    onClick={() => removeItem(d.id)}
                    className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-miss"
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <DropGrid drops={drops} showScores />
        )}
      </div>
    </div>
  )
}
