import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Collection, Drop, Profile } from '../lib/types'
import { dropMedia } from '../lib/types'
import { fetchListSummary, type ListSummary } from '../lib/lists'
import { peakHaptic, tapHaptic } from '../lib/haptics'
import { Avatar, navigate } from '../App'
import BetIcon from '../components/BetIcon'
import ListLikeButton from '../components/ListLikeButton'
import AddDropsSheet from '../components/AddDropsSheet'
import EmptyState from '../components/EmptyState'

/**
 * A posted list's page: the drops IN THE OWNER'S ORDER (0053 position),
 * each row a normal drop (tap through to rate/Try it there — the list
 * itself is never rated). The mountain like sits at the right of the
 * header; double-tapping the preview likes through the same path.
 * Share + Try (save the whole run) joined the header on Jose's call
 * (2026-10-26 02:31, reversing his earlier no-share/no-try-all pass).
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
  const [likeCount, setLikeCount] = useState(0)
  const [likedByMe, setLikedByMe] = useState(false)
  const [sharedNote, setSharedNote] = useState(false)
  const [mySaves, setMySaves] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [tryBusy, setTryBusy] = useState(false)

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
    if (sum) {
      setLikeCount(sum.likeCount)
      setLikedByMe(sum.likedByMe)
    }
    const list = ((itemsRes.data ?? []) as unknown as Array<{ drop: Drop | null }>)
      .map((i) => i.drop)
      .filter((d): d is Drop => !!d)
    setDrops(list)
    if (user && list.length > 0) {
      const { data: saveRows } = await supabase
        .from('saves')
        .select('drop_id')
        .eq('user_id', user.id)
        .in('drop_id', list.map((d) => d.id))
      setMySaves(new Set(((saveRows ?? []) as Array<{ drop_id: string }>).map((r) => r.drop_id)))
    }
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

  const toggleLike = async (onlyLike = false) => {
    if (!user || isOwner) return
    if (onlyLike && likedByMe) return
    const next = !likedByMe
    setLikedByMe(next)
    setLikeCount((c) => c + (next ? 1 : -1))
    if (next) peakHaptic()
    else tapHaptic()
    const res = next
      ? await supabase.from('collection_likes').insert({ collection_id: id, user_id: user.id })
      : await supabase.from('collection_likes').delete().eq('collection_id', id).eq('user_id', user.id)
    if (res.error) {
      setLikedByMe(!next)
      setLikeCount((c) => c + (next ? -1 : 1))
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/list/${id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: col?.name ?? 'Peak list', url })
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

  const allTried = drops.length > 0 && drops.every((d) => mySaves.has(d.id))
  const tryAll = async () => {
    if (!user) {
      navigate('/auth')
      return
    }
    if (tryBusy || allTried) return
    const missing = drops.filter((d) => !mySaves.has(d.id))
    if (missing.length === 0) return
    setTryBusy(true)
    const { error } = await supabase
      .from('saves')
      .insert(missing.map((d) => ({ user_id: user.id, drop_id: d.id })))
    if (!error) setMySaves((prev) => new Set([...prev, ...missing.map((d) => d.id)]))
    setTryBusy(false)
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
          </div>
          {summary && (
            <div className="shrink-0 pt-4">
              <ListLikeButton
                listId={id}
                ownerId={col.owner_id}
                count={likeCount}
                liked={likedByMe}
                size="lg"
                onToggle={() => void toggleLike()}
              />
            </div>
          )}
        </div>

        {/* Preview of the run — double-tap to like (rows below navigate). */}
        <div onDoubleClick={() => void toggleLike(true)} className="mt-4 select-none">
          {drops.length > 0 ? (
            <div className="flex gap-1.5">
              {drops.slice(0, 4).map((d, i) => {
                const cover = rowCover(d)
                return (
                  <div key={d.id} className="relative h-24 min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-ink-3">
                    {cover ? (
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center p-2 text-center text-[11px] font-bold leading-tight text-fog/80">
                        {d.title}
                      </span>
                    )}
                    {i === 3 && drops.length > 4 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-black text-white">
                        +{drops.length - 4}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-line px-4 text-center text-xs text-mute">
              Drops you add will preview here.
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={share} className="rounded-full bg-sig px-4 py-2 text-sm font-black text-ink">
            {sharedNote ? 'Link copied!' : 'Share list'}
          </button>
          {!isOwner && drops.length > 0 && (
            <button
              onClick={() => void tryAll()}
              disabled={tryBusy || allTried}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black transition ${
                allTried ? 'border border-line text-win' : 'border border-sig/60 text-sig hover:bg-sig hover:text-ink'
              } disabled:opacity-70`}
            >
              <BetIcon saved={allTried} className="h-4 w-4" />
              {tryBusy ? 'Saving…' : allTried ? 'In your Try list' : 'Try'}
            </button>
          )}
          {isOwner && (
            <>
              <button onClick={() => setAdding(true)} className="rounded-full border border-sig/60 px-4 py-2 text-sm font-black text-sig">
                + Add drops
              </button>
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
            {isOwner
              ? 'Nothing in this list yet — tap "+ Add drops" to pick from your Try list and your own posts, or add from any post's ··· menu.'
              : 'Nothing in this list yet.'}
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
      {adding && (
        <AddDropsSheet
          listId={id}
          onClose={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
