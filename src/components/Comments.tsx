import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Comment, Profile } from '../lib/types'
import { timeAgo } from '../lib/format'
import { Avatar, navigate } from '../App'
import { notify } from '../lib/notify'
import MentionText from './MentionText'
import { ScoreField } from './RateSheet'
import { formatScore } from '../lib/ratings'

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
  // Rating picker for this comment (1–10). Prefilled from the user's existing
  // rating on this drop, if any — posting with a new one replaces it.
  const [picked, setPicked] = useState<number | null>(null)
  const [rateOpen, setRateOpen] = useState(false)
  const pickedTouched = useRef(false)
  // Reply target: replies hang off the TOP-LEVEL comment (one level deep).
  const [replyTo, setReplyTo] = useState<{ topId: string; name: string } | null>(null)
  // @mention autocomplete: the token being typed + matching profiles.
  const [mentionOpts, setMentionOpts] = useState<Profile[]>([])
  // Comment likes: counts per comment + the set I have liked.
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map())
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<'new' | 'top'>('new')
  const [reportArm, setReportArm] = useState<string | null>(null)
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())

  const reportComment = async (c: Comment) => {
    if (!user) return
    if (reportArm !== c.id) {
      setReportArm(c.id)
      return
    }
    setReportArm(null)
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      comment_id: c.id,
      reported_user_id: c.user_id,
      reason: 'Inappropriate comment',
    })
    if (!error) setReportedIds((prev) => new Set(prev).add(c.id))
  }
  const mentionToken = useRef<{ start: number; end: number; q: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const onBodyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setBody(v)
    const caret = e.target.selectionStart ?? v.length
    const m = v.slice(0, caret).match(/(?:^|\s)@([A-Za-z0-9_]*)$/)
    if (m && m[1].length >= 1) {
      mentionToken.current = { start: caret - m[1].length - 1, end: caret, q: m[1].toLowerCase() }
      const q = m[1].toLowerCase()
      window.setTimeout(async () => {
        if (mentionToken.current?.q !== q) return // superseded by newer typing
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .ilike('username', `${q}%`)
          .neq('id', user?.id ?? '')
          .order('username')
          .limit(5)
        if (mentionToken.current?.q === q) setMentionOpts((data ?? []) as Profile[])
      }, 150)
    } else {
      mentionToken.current = null
      setMentionOpts([])
    }
  }

  const pickMention = (p: Profile) => {
    const tok = mentionToken.current
    if (!tok) return
    const insert = `@${p.username} `
    const next = body.slice(0, tok.start) + insert + body.slice(tok.end)
    setBody(next)
    mentionToken.current = null
    setMentionOpts([])
    const el = inputRef.current
    if (el) {
      el.focus()
      const pos = tok.start + insert.length
      requestAnimationFrame(() => el.setSelectionRange(pos, pos))
    }
  }

  const isAuthor = !!user && !!authorId && user.id === authorId
  const myRated = comments.find((c) => user && c.user_id === user.id && c.rating != null)
  const rated = comments.filter((c) => c.rating != null && c.user_id !== authorId)
  const communityMean = rated.length > 0 ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length : null
  // Top-level order: chronological by default; "Top" floats the most
  // liked (then highest-rated) takes. Replies always stay nested.
  const topLevel = comments.filter((c) => !c.parent_id || !comments.some((p) => p.id === c.parent_id))
  const baseOrdered =
    sortMode === 'top'
      ? [...topLevel].sort(
          (a, b) =>
            (likeCounts.get(b.id) ?? 0) - (likeCounts.get(a.id) ?? 0) ||
            (b.rating ?? 0) - (a.rating ?? 0) ||
            b.created_at.localeCompare(a.created_at),
        )
      : topLevel
  // The author's pinned comment always leads the thread.
  const orderedTop = [...baseOrdered].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false),
  )

  const [pinBusy, setPinBusy] = useState<string | null>(null)
  const togglePin = async (c: Comment) => {
    if (pinBusy) return
    setPinBusy(c.id)
    const { data, error } = await supabase.rpc('set_comment_pin', {
      p_comment: c.id,
      p_pinned: !c.pinned,
    })
    setPinBusy(null)
    if (!error && data === true) {
      setComments((prev) =>
        prev.map((x) => ({
          ...x,
          pinned: x.id === c.id ? !c.pinned : c.pinned ? x.pinned : false,
        })),
      )
    }
  }

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
      // Likes for this thread (counts + which ones are mine).
      if (list.length > 0) {
        const { data: likeRows } = await supabase
          .from('comment_likes')
          .select('comment_id, user_id')
          .in('comment_id', list.map((c) => c.id))
          .limit(2000)
        if (live && likeRows) {
          const counts = new Map<string, number>()
          const mine = new Set<string>()
          for (const l of likeRows as Array<{ comment_id: string; user_id: string }>) {
            counts.set(l.comment_id, (counts.get(l.comment_id) ?? 0) + 1)
            if (l.user_id === user?.id) mine.add(l.comment_id)
          }
          setLikeCounts(counts)
          setMyLikes(mine)
        }
      }
      // Prefill the picker from the user's existing rating (once per drop).
      if (!pickedTouched.current && user) {
        const mine = list.find((c) => c.user_id === user.id && c.rating != null)
        if (mine?.rating != null) setPicked(mine.rating)
      }
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
      // Replies never carry the drop rating — the rating belongs to your
      // top-level take. One rating per user per drop: clear the old rated
      // comment first, then attach the new rating to this comment.
      if (!replyTo && picked != null && !isAuthor) {
        await supabase
          .from('comments')
          .update({ rating: null })
          .eq('drop_id', dropId)
          .eq('user_id', user.id)
          .not('rating', 'is', null)
      }
      const payload = {
        drop_id: dropId,
        user_id: user.id,
        body: text.slice(0, 500),
        rating: !replyTo && picked != null && !isAuthor ? picked : null,
        parent_id: replyTo?.topId ?? null,
      }
      let res = await supabase.from('comments').insert(payload).select('*').single()
      if (res.error && replyTo && /parent_id/.test(res.error.message)) {
        // Schema lag (0036 not applied yet): land it as a top-level comment
        // instead of failing the post outright.
        res = await supabase
          .from('comments')
          .insert({
            drop_id: payload.drop_id,
            user_id: payload.user_id,
            body: payload.body,
            rating: payload.rating,
          })
          .select('*')
          .single()
      }
      const { data, error } = res
      if (error) throw error
      const c = data as Comment
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (prof) c.user = prof as Profile
      // Mirror the DB rating move locally: a fresh rated post clears the
      // star on my older comments (the DB already did this — without the
      // local patch the thread keeps showing two ratings until reload).
      const ratedPost = !replyTo && picked != null && !isAuthor
      const base = ratedPost
        ? comments.map((x) => (x.user_id === user.id && x.rating != null ? { ...x, rating: null } : x))
        : comments
      const next = [...base, c]
      setComments(next)
      onCountChange?.(next.length)
      setBody('')
      setReplyTo(null)
      mentionToken.current = null
      setMentionOpts([])
      if (authorId) void notify(authorId, user.id, 'comment', dropId)
    } catch {
      // Draft is preserved above (setBody only runs on success).
      setError('Could not post your comment — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const toggleLike = async (c: Comment) => {
    if (!user || c.user_id === user.id) return
    const liked = myLikes.has(c.id)
    const flip = (delta: number) => {
      setMyLikes((prev) => {
        const next = new Set(prev)
        if (delta > 0) next.add(c.id)
        else next.delete(c.id)
        return next
      })
      setLikeCounts((prev) => {
        const next = new Map(prev)
        next.set(c.id, Math.max(0, (next.get(c.id) ?? 0) + delta))
        return next
      })
    }
    flip(liked ? -1 : 1)
    const res = liked
      ? await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', user.id)
      : await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: user.id })
    if (res.error) flip(liked ? 1 : -1)
  }

  const remove = async (id: string) => {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.from('comments').delete().eq('id', id).eq('user_id', user.id)
      if (error) throw error
      // Deleting a top-level comment cascade-deletes its replies (FK).
      const next = comments.filter((c) => c.id !== id && c.parent_id !== id)
      setComments(next)
      onCountChange?.(next.length)
    } catch {
      setError('Could not delete that comment — try again.')
    } finally {
      setBusy(false)
    }
  }

  /** One comment row; replies reuse it, hanging off their top-level parent. */
  const commentRow = (c: Comment, topId: string) => (
    <div className="flex gap-2.5">
      <Avatar url={c.user?.avatar_url ?? null} name={c.user?.display_name ?? c.user?.username ?? '?'} size={32} />
      <div className="min-w-0 flex-1">
        {c.pinned && (
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-wider text-butter">
            Pinned by the author
          </p>
        )}
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-black">
            {c.user?.display_name || (c.user ? `@${c.user.username}` : 'Someone')}
          </span>
          {c.rating != null && (
            <span className="shrink-0 rounded-full bg-sig/15 px-1.5 py-px text-[10px] font-black text-sig">
              ★ {formatScore(c.rating)}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-mute">{timeAgo(c.created_at)}</span>
          {user && c.user_id !== user.id ? (
            <button
              onClick={() => toggleLike(c)}
              aria-pressed={myLikes.has(c.id)}
              aria-label="Like comment"
              className={`flex shrink-0 items-center gap-1 text-[10px] font-bold transition ${
                myLikes.has(c.id) ? 'text-sig' : 'text-mute hover:text-fog'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={myLikes.has(c.id) ? 3.2 : 2.4} strokeLinecap="round" aria-hidden>
                <path d="M4 5v14M9.3 5v14M14.6 5v14M19.9 5v14M3 17.5 21 6.5" />
              </svg>
              {(likeCounts.get(c.id) ?? 0) > 0 && <span className="tabular-nums">{likeCounts.get(c.id)}</span>}
            </button>
          ) : (
            (likeCounts.get(c.id) ?? 0) > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-mute">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
                  <path d="M4 5v14M9.3 5v14M14.6 5v14M19.9 5v14M3 17.5 21 6.5" />
                </svg>
                <span className="tabular-nums">{likeCounts.get(c.id)}</span>
              </span>
            )
          )}
          {user && c.user_id !== user.id && (
            <button
              onClick={() =>
                setReplyTo({
                  topId,
                  name: c.user?.display_name || (c.user ? `@${c.user.username}` : 'Someone'),
                })
              }
              className="ml-auto shrink-0 text-[10px] font-bold text-mute hover:text-sig"
            >
              Reply
            </button>
          )}
          {user &&
            c.user_id !== user.id &&
            (reportedIds.has(c.id) ? (
              <span className="shrink-0 text-[10px] font-bold text-win">Reported ✓</span>
            ) : (
              <button
                onClick={() => reportComment(c)}
                className="shrink-0 text-[10px] font-bold text-mute hover:text-miss"
              >
                {reportArm === c.id ? 'Tap again to report' : 'Report'}
              </button>
            ))}
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
          {isAuthor && !c.parent_id && (
            <button
              onClick={() => togglePin(c)}
              disabled={pinBusy === c.id}
              className={`shrink-0 text-[10px] font-bold disabled:opacity-50 ${
                c.pinned ? 'text-butter' : 'text-mute hover:text-butter'
              }`}
            >
              {c.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>
        <p className="mt-0.5 break-words text-sm"><MentionText text={c.body} /></p>
      </div>
    </div>
  )

  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-4">
      <div className="mb-3 flex items-baseline justify-between text-sm font-black">
        <span>
          Comments{comments.length > 0 && <span className="text-mute"> · {comments.length}</span>}
        </span>
        {communityMean != null && (
          <span className="text-xs font-bold text-mute">
            Community <span className="text-sig">★ {communityMean.toFixed(1)}</span>
            <span className="font-normal"> · {rated.length}</span>
          </span>
        )}
      </div>
      {comments.length > 1 && (
        <div className="mb-3 flex gap-1.5">
          {(
            [
              { id: 'new', label: 'New' },
              { id: 'top', label: 'Top' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSortMode(s.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-black transition ${
                sortMode === s.id ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {comments.length === 0 ? (
        <p className="mb-3 text-xs text-mute">No comments yet — say the thing everyone's thinking.</p>
      ) : (
        <div className="mb-3 flex flex-col gap-3">
          {orderedTop.map((c) => (
              <div key={c.id}>
                {commentRow(c, c.id)}
                {comments
                  .filter((r) => r.parent_id === c.id)
                  .map((r) => (
                    <div key={r.id} className="ml-10 mt-3">
                      {commentRow(r, c.id)}
                    </div>
                  ))}
              </div>
            ))}
        </div>
      )}

      {error && <p className="mb-2 text-xs font-bold text-miss">{error}</p>}

      {user ? (
        <div>
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-full bg-sig/10 px-3.5 py-1.5 text-xs font-bold text-sig">
              <span className="truncate">Replying to {replyTo.name}</span>
              <button
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="ml-2 shrink-0 text-sm font-black text-sig"
              >
                ✕
              </button>
            </div>
          )}
          {mentionOpts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {mentionOpts.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickMention(p)
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-sig/50 bg-sig/10 py-1 pl-1 pr-3 text-xs font-bold text-sig"
                >
                  <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={18} />
                  @{p.username}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {!isAuthor && !replyTo && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setRateOpen((o) => !o)}
                  aria-label="Rate this drop"
                  className={`flex h-full min-h-[42px] items-center rounded-full border px-3 text-sm font-black transition ${
                    picked != null
                      ? 'border-sig/60 bg-sig/15 text-sig'
                      : 'border-line text-mute hover:border-sig/50 hover:text-sig'
                  }`}
                >
                  {picked != null ? `★ ${formatScore(picked)}` : '★ Rate'}
                </button>
                {rateOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setRateOpen(false)} />
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-[248px] rounded-2xl border border-line bg-ink-3 p-3 shadow-xl">
                      <div className="flex justify-center py-1">
                        <ScoreField
                          value={picked}
                          onChange={(v) => {
                            pickedTouched.current = true
                            setPicked(v)
                          }}
                        />
                      </div>
                      <button
                        onClick={() => setRateOpen(false)}
                        className="mt-1 w-full rounded-xl bg-sig py-2 text-sm font-black text-ink"
                      >
                        Done
                      </button>
                      {myRated != null && (
                        <button
                          onClick={() => {
                            pickedTouched.current = true
                            setPicked(null)
                            setRateOpen(false)
                          }}
                          className="mt-1.5 w-full rounded-xl py-1.5 text-xs font-bold text-mute hover:text-miss"
                        >
                          Remove my rating
                        </button>
                      )}
                      <p className="mt-1 px-1 pb-1 text-[10px] leading-snug text-mute">
                        {myRated != null
                          ? 'Posting with a new rating replaces your old one.'
                          : 'One rating per drop — it shows next to your comment.'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
            <input
              ref={inputRef}
              value={body}
              onChange={onBodyChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') post()
              }}
              placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
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
        </div>
      ) : (
        <button
          onClick={() => navigate('/auth')}
          className="w-full rounded-full border border-line py-2.5 text-sm font-bold text-mute"
        >
          Join Peak to comment
        </button>
      )}
    </div>
  )
}
