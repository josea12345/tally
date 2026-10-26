import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { peakHaptic, tapHaptic } from '../lib/haptics'
import { PeakMark } from './PeakWordmark'

/**
 * The mountain like — a list's only social signal (0053). One tap =
 * liked, tap again = unliked. Owners don't see it on their own lists
 * (the count still shows, as a plain stat). Optimistic, with rollback.
 */
export default function ListLikeButton({
  listId,
  ownerId,
  count,
  liked,
  size = 'md',
  onToggle,
}: {
  listId: string
  ownerId: string
  count: number
  liked: boolean
  size?: 'md' | 'lg'
  /** Controlled mode: the parent owns the like state (the list page
   *  uses it so double-tapping the preview likes through the same path). */
  onToggle?: () => void
}) {
  const { user } = useAuth()
  const [state, setState] = useState({ count, liked })
  const [busy, setBusy] = useState(false)
  // Keep in sync when the parent refetches (e.g. after another toggle reload).
  const [seen, setSeen] = useState({ count, liked })
  if (seen.count !== count || seen.liked !== liked) {
    setSeen({ count, liked })
    setState({ count, liked })
  }

  const isOwner = !!user && user.id === ownerId
  const markCls = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  const textCls = size === 'lg' ? 'text-base' : 'text-sm'

  if (!user || isOwner) {
    return (
      <span className={`flex items-center gap-1.5 font-black ${textCls} ${state.count > 0 ? 'text-sig' : 'text-mute'}`}>
        <PeakMark className={markCls} />
        {state.count}
      </span>
    )
  }

  if (onToggle) {
    return !user || isOwner ? (
      <span className={`flex items-center gap-1.5 font-black ${textCls} ${count > 0 ? 'text-sig' : 'text-mute'}`}>
        <PeakMark className={markCls} />
        {count}
      </span>
    ) : (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-pressed={liked}
        aria-label={liked ? 'Unlike this list' : 'Like this list'}
        className={`press flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-black transition ${textCls} ${
          liked ? 'border-sig bg-sig/15 text-sig' : 'border-line text-mute hover:text-sig'
        }`}
      >
        <PeakMark className={markCls} />
        {count}
      </button>
    )
  }

  const toggle = async () => {
    if (busy) return
    const next = !state.liked
    setState({ count: state.count + (next ? 1 : -1), liked: next })
    if (next) peakHaptic()
    else tapHaptic()
    setBusy(true)
    const res = next
      ? await supabase.from('collection_likes').insert({ collection_id: listId, user_id: user.id })
      : await supabase.from('collection_likes').delete().eq('collection_id', listId).eq('user_id', user.id)
    setBusy(false)
    if (res.error) setState({ count, liked }) // rollback to the server-truth props
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        void toggle()
      }}
      disabled={busy}
      aria-pressed={state.liked}
      aria-label={state.liked ? 'Unlike this list' : 'Like this list'}
      className={`press flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-black transition ${textCls} ${
        state.liked ? 'border-sig bg-sig/15 text-sig' : 'border-line text-mute hover:text-sig'
      }`}
    >
      <PeakMark className={markCls} />
      {state.count}
    </button>
  )
}
