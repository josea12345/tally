import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Comment, Profile } from '../lib/types'
import { timeAgo } from '../lib/format'
import { Avatar, navigate } from '../App'
import { notify } from '../lib/notify'

/** Threaded conversation on a drop: list + post + delete-own. */
export default function Comments({
  dropId,
  authorId,
  onCountChange,
}: {
  dropId: string
  authorId?: string
  onCountChange?: (n: number) => void
}) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('drop_id', dropId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (!live) return
      const list = (data ?? []) as Comment[]
      const ids = [...new Set(list.map((c) => c.user_id))]
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
        const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))
        for (const c of list) c.user = byId.get(c.user_id)
      }
      if (!live) return
      setComments(list)
      onCountChange?.(list.length)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropId])

  const post = async () => {
    const text = body.trim()
    if (!text || !user || busy) return
    setBusy(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({ drop_id: dropId, user_id: user.id, body: text.slice(0, 500) })
        .select('*')
        .single()
      if (error) throw error
      const c = data as Comment
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (prof) c.user = prof as Profile
      const next = [...comments, c]
      setComments(next)
      onCountChange?.(next.length)
      setBody('')
      if (authorId) void notify(authorId, user.id, 'comment', dropId)
    } catch {
      // Draft is preserved above (setBody only runs on success).
      setError('Could not post your comment — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.from('comments').delete().eq('id', id).eq('user_id', user.id)
      if (error) throw error
      const next = comments.filter((c) => c.id !== id)
      setComments(next)
      onCountChange?.(next.length)
    } catch {
      setError('Could not delete that comment — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-4">
      <div className="mb-3 text-sm font-black">
        Comments{comments.length > 0 && <span className="text-mute"> · {comments.length}</span>}
      </div>

      {comments.length === 0 ? (
        <p className="mb-3 text-xs text-mute">No comments yet — say the thing everyone's thinking.</p>
      ) : (
        <div className="mb-3 flex flex-col gap-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar url={c.user?.avatar_url ?? null} name={c.user?.display_name ?? c.user?.username ?? '?'} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-black">
                    {c.user?.display_name || (c.user ? `@${c.user.username}` : 'Someone')}
                  </span>
                  <span className="shrink-0 text-[10px] text-mute">{timeAgo(c.created_at)}</span>
                  {user && c.user_id === user.id && (
                    <button
                      onClick={() => remove(c.id)}
                      disabled={busy}
                      aria-label="Delete comment"
                      className="ml-auto shrink-0 text-[10px] font-bold text-mute hover:text-miss"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="mt-0.5 break-words text-sm">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-2 text-xs font-bold text-miss">{error}</p>}

      {user ? (
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') post()
            }}
            placeholder="Add a comment…"
            maxLength={500}
            disabled={busy}
            className="min-w-0 flex-1 rounded-full border border-line bg-ink-3 px-4 py-2.5 text-sm outline-none placeholder:text-mute focus:border-sig"
          />
          <button
            onClick={post}
            disabled={busy || body.trim().length === 0}
            className="shrink-0 rounded-full bg-sig px-5 py-2.5 text-sm font-black text-ink disabled:opacity-40"
          >
            Post
          </button>
        </div>
      ) : (
        <button
          onClick={() => navigate('/auth')}
          className="w-full rounded-full border border-line py-2.5 text-sm font-bold text-mute"
        >
          Join TALLY to comment
        </button>
      )}
    </div>
  )
}
