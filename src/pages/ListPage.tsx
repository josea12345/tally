import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Collection, Drop, Profile } from '../lib/types'
import { dropMedia } from '../lib/types'
import { fetchListSummary, type ListSummary } from '../lib/lists'
import { Avatar, navigate } from '../App'
import ListLikeButton from '../components/ListLikeButton'
import EmptyState from '../components/EmptyState'

/**
 * A posted list's page: the drops IN THE OWNER'S ORDER (0053 position),
 * each row a normal drop (tap through to rate/Try it there — the list
 * itself is never rated). The list's only signal is the mountain like
 * in the header. No share button, no Try-all (Jose's spec, 2026-10-26).
 * Owner controls: reorder (in Manage), rename, public/private, delete.
 */
export default function ListPage({ id }: { id: string }) {
  const { user } = useAuth()
  const [col, setCol] = useState<(Collection & { owner?: Profile | null }) | null>(null)
  const [summary, setSummary] = useState<ListSummary | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [managing, setManaging] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)

  const isOwner = !!user && !!col && user.id === col.owner_id

  const load = async () => {
    const { data: c } = await supabase
      .from('collections')
      .select('*, owner:profiles!collections_owner_id_fkey(*)')
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
    const [sum, itemsRes] = await Promise.all([
      fetchListSummary(id, user?.id ?? null),
      supabase
        .from('collection_items')
        .select('drop:drops!collection_items_drop_id_fkey(*, author:profiles!drops_author_id_fkey(*))')
        .eq('collection_id', id)
        .order('position', { ascending: true })
        .order('added_at', { ascending: true })
        .limit(200),
    ])
    setSummary(sum)
    const list = ((itemsRes.data ?? []) as unknown as Array<{ drop: Drop | null }>)
      .map((i) => i.drop)
      .filter((d): d is Drop => !!d)
    setDrops(list)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const persistOrder = async (ordered: Drop[]) => {
    setSavingOrder(true)
    await Promise.all(
      ordered.map((d, i) =>
        supabase.from('collection_items').update({ position: i }).eq('collection_id', id).eq('drop_id', d.id),
      ),
    )
    setSavingOrder(false)
  }

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= drops.length) return
    const next = [...drops]
    const [it] = next.splice(idx, 1)
    next.splice(j, 0, it)
    setDrops(next)
    void persistOrder(next)
  }

  const removeItem = async (dropId: string) => {
    if (!isOwner) return
    const { error } = await supabase
      .from('collection_items')
      .delete()
      .eq('collection_id', id)
      .eq('drop_id', dropId)
    if (!error) {
      const next = drops.filter((d) => d.id !== dropId)
      setDrops(next)
      void persistOrder(next)
    }
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

  const rowCover = (d: Drop) => {
    const cover = dropMedia(d)[0]
    if (!cover) return null
    return cover.type === 'video' ? cover.posterUrl : cover.url
  }

  return (
    <div className="pb-10">
      <div className="px-4 pt-5">
        <button onClick={() => navigate('/')} className="text-sm font-bold text-mute transition hover:text-sig">
          ← Lists
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
          <h1 className="mt-3 font-display text-[26px] font-bold leading-tight">{col.name}</h1>
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {summary && (
            <ListLikeButton
              listId={id}
              ownerId={col.owner_id}
              count={summary.likeCount}
              liked={summary.likedByMe}
              size="lg"
            />
          )}
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
        {isOwner && col.is_public && drops.length === 0 && (
          <p className="mt-3 text-xs text-mute">
            Empty lists don't show in the Lists section yet — add a drop and it goes live.
          </p>
        )}
      </div>

      <div className="mt-5 px-4">
        {drops.length === 0 ? (
          <p className="text-sm text-mute">
            Nothing in this list yet — add drops from any post's ··· menu ("Add to list…"), or use "Build a list" there to stack them in order.
          </p>
        ) : (
          <ol className="space-y-2">
            {drops.map((d, i) => {
              const cover = rowCover(d)
              const inner = (
                <>
                  <span className="w-6 shrink-0 text-center font-display text-lg font-bold text-mute">{i + 1}</span>
                  {cover ? (
                    <img src={cover} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-black object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-sm font-black text-sig">
                      {d.score ?? '•'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{d.title}</span>
                    <span className="block text-xs text-mute">
                      @{d.author?.username ?? '?'}
                      {d.score != null && <span className="text-sig"> · their call {d.score}</span>}
                    </span>
                  </span>
                </>
              )
              return (
                <li key={d.id} className="flex items-center gap-2.5 rounded-2xl border border-line bg-ink-2 p-2.5">
                  {managing && isOwner ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {inner}
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0 || savingOrder}
                          aria-label="Move up"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm font-black text-fog disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === drops.length - 1 || savingOrder}
                          aria-label="Move down"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm font-black text-fog disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeItem(d.id)}
                          className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-miss"
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  ) : (
                    <button onClick={() => navigate(`/drop/${d.id}`)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      {inner}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
