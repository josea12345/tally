import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Avatar, navigate } from '../App'
import { CATEGORY_GROUPS } from '../lib/types'
import { timeAgo } from '../lib/format'
import {
  createRequest,
  deleteRequest,
  fetchRequests,
  type RequestWithCount,
} from '../lib/requests'
import EmptyState from '../components/EmptyState'

function categoryLabel(id: string | null): string | null {
  if (!id) return null
  return CATEGORY_GROUPS.find((g) => g.id === id)?.label ?? id
}

/**
 * Put-me-on requests: the demand side. Ask your people for a spot;
 * anyone can answer by pointing at a real drop.
 */
export default function Requests() {
  const { user } = useAuth()
  const [items, setItems] = useState<RequestWithCount[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [hood, setHood] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(await fetchRequests())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const post = async () => {
    if (!user || !prompt.trim() || busy) return
    setBusy(true)
    const created = await createRequest(
      user.id,
      prompt.trim(),
      category,
      hood.trim() || null,
    )
    setBusy(false)
    if (created) {
      setPrompt('')
      setCategory(null)
      setHood('')
      setAsking(false)
      void load()
    }
  }

  const remove = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    setConfirmDelete(null)
    await deleteRequest(id)
    setItems((prev) => (prev ?? []).filter((r) => r.id !== id))
  }

  return (
    <div>
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="wordmark text-3xl">Put me on</h1>
        <p className="text-sm text-mute">Ask your people. Get put on.</p>
      </div>

      <div className="border-b border-line px-4 py-3">
        {!asking ? (
          <button
            onClick={() => (user ? setAsking(true) : navigate('/auth'))}
            className="btn-pop press w-full rounded-full py-3 text-sm"
          >
            Ask for a put-on
          </button>
        ) : (
          <div>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Put me on: best late-night tacos…"
              maxLength={140}
              autoFocus
              className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-3 text-[15px] font-bold outline-none placeholder:text-mute/60 focus:border-sig"
            />
            <div className="no-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1">
              <button
                onClick={() => setCategory(null)}
                className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
                  category === null ? 'bg-sig text-ink' : 'border border-line bg-ink-2 text-mute'
                }`}
              >
                Anything
              </button>
              {CATEGORY_GROUPS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setCategory(g.id)}
                  className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
                    category === g.id ? 'bg-sig text-ink' : 'border border-line bg-ink-2 text-mute'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <input
              value={hood}
              onChange={(e) => setHood(e.target.value)}
              placeholder="Neighborhood (optional)"
              maxLength={60}
              className="mt-2.5 w-full rounded-full border border-line bg-ink-2 px-4 py-2 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void post()}
                disabled={!prompt.trim() || busy}
                className="btn-pop press flex-1 rounded-full py-2.5 text-sm disabled:opacity-40"
              >
                Post the ask
              </button>
              <button
                onClick={() => setAsking(false)}
                className="press rounded-full border border-line px-4 py-2.5 text-sm font-bold text-mute"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {items === null ? (
        <div className="space-y-3 px-4 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-3xl bg-ink-3" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nobody's asking yet"
          body="Be the first — ask your people for a spot and let them put you on."
          mood="happy"
        />
      ) : (
        <div>
          {items.map((r) => (
            <div key={r.id} className="relative border-b border-line">
              <button
                onClick={() => navigate(`/request/${r.id}`)}
                className="block w-full px-4 py-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <Avatar url={r.author?.avatar_url ?? null} name={r.author?.display_name ?? r.author?.username ?? '?'} size={26} />
                  <span className="text-xs font-bold text-mute">
                    @{r.author?.username ?? '?'} · {timeAgo(r.created_at)}
                  </span>
                </span>
                <span className="mt-2 block text-[17px] font-bold leading-snug">{r.prompt}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  {categoryLabel(r.category) && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-mute">{categoryLabel(r.category)}</span>
                  )}
                  {r.neighborhood && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-mute">{r.neighborhood}</span>
                  )}
                  <span className={r.answerCount > 0 ? 'text-sig' : 'text-mute'}>
                    {r.answerCount > 0
                      ? `${r.answerCount} answer${r.answerCount === 1 ? '' : 's'}`
                      : 'No answers yet'}
                  </span>
                </span>
              </button>
              {user?.id === r.author_id && (
                <button
                  onClick={() => void remove(r.id)}
                  className={`press absolute right-4 top-4 text-[11px] font-black ${
                    confirmDelete === r.id ? 'text-miss' : 'text-mute/60'
                  }`}
                >
                  {confirmDelete === r.id ? 'Tap again to delete' : 'Delete'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
