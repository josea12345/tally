import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Avatar, navigate } from '../App'
import { CATEGORY_GROUPS, type Drop } from '../lib/types'
import { timeAgo } from '../lib/format'
import {
  answerWithDrop,
  deleteRequest,
  fetchAnswerDrops,
  fetchMyAnswerId,
  fetchRequest,
  removeAnswer,
  type RequestWithCount,
} from '../lib/requests'
import AnswerSheet from '../components/AnswerSheet'
import DropGrid from '../components/DropGrid'
import EmptyState from '../components/EmptyState'

export default function RequestDetail({ id }: { id: string }) {
  const { user } = useAuth()
  const [req, setReq] = useState<RequestWithCount | null>(null)
  const [missing, setMissing] = useState(false)
  const [answers, setAnswers] = useState<Drop[] | null>(null)
  const [myAnswerId, setMyAnswerId] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    const r = await fetchRequest(id)
    if (!r) {
      setMissing(true)
      return
    }
    setReq(r)
    setAnswers(await fetchAnswerDrops(id))
    if (user) setMyAnswerId(await fetchMyAnswerId(id, user.id))
  }, [id, user])

  useEffect(() => {
    void load()
  }, [load])

  if (missing) {
    return (
      <EmptyState
        title="This ask is gone"
        body="It may have been deleted by the person who asked."
        mood="sleepy"
        action={
          <button onClick={() => navigate('/requests')} className="btn-pop press px-6 py-2.5 text-sm">
            Back to asks
          </button>
        }
      />
    )
  }
  if (!req) {
    return (
      <div className="space-y-3 px-4 py-4">
        <div className="h-24 animate-pulse rounded-3xl bg-ink-3" />
        <div className="h-40 animate-pulse rounded-3xl bg-ink-3" />
      </div>
    )
  }

  const isAsker = !!user && user.id === req.author_id
  const categoryLabel = req.category
    ? (CATEGORY_GROUPS.find((g) => g.id === req.category)?.label ?? req.category)
    : null

  return (
    <div>
      <div className="border-b border-line px-4 pb-4 pt-5">
        <button onClick={() => navigate('/requests')} className="press text-xs font-black text-sig">
          ← All asks
        </button>
        <div className="mt-3 flex items-center gap-2">
          <Avatar url={req.author?.avatar_url ?? null} name={req.author?.display_name ?? req.author?.username ?? '?'} size={30} />
          <span className="text-sm font-bold text-mute">
            @{req.author?.username ?? '?'} · {timeAgo(req.created_at)}
          </span>
        </div>
        <h1 className="mt-2 text-[22px] font-black leading-tight">{req.prompt}</h1>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
          {categoryLabel && (
            <span className="rounded-full border border-line px-2 py-0.5 text-mute">{categoryLabel}</span>
          )}
          {req.neighborhood && (
            <span className="rounded-full border border-line px-2 py-0.5 text-mute">{req.neighborhood}</span>
          )}
        </div>

        {!isAsker ? (
          <button
            onClick={() => (user ? setAnswering(true) : navigate('/auth'))}
            className="btn-pop press mt-4 w-full rounded-full py-3 text-sm"
          >
            Answer with one of your drops
          </button>
        ) : (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-bold text-mute">This is your ask.</p>
            <button
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }
                void deleteRequest(req.id).then(() => navigate('/requests'))
              }}
              className={`press text-[11px] font-black ${confirmDelete ? 'text-miss' : 'text-mute/60'}`}
            >
              {confirmDelete ? 'Tap again to delete' : 'Delete ask'}
            </button>
          </div>
        )}
        {myAnswerId && (
          <button
            onClick={() => {
              void removeAnswer(myAnswerId).then(() => {
                setMyAnswerId(null)
                void load()
              })
            }}
            className="press mt-2 text-[11px] font-black text-miss"
          >
            Remove my answer
          </button>
        )}
      </div>

      <div className="px-4 pt-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-mute">
          Answers{answers && answers.length > 0 ? ` · ${answers.length}` : ''}
        </h2>
      </div>
      {answers === null ? (
        <div className="space-y-3 px-4 py-4">
          <div className="h-32 animate-pulse rounded-3xl bg-ink-3" />
        </div>
      ) : answers.length === 0 ? (
        <EmptyState
          title="No answers yet"
          body="Be the first to put them on — answer with a drop you'd actually send a friend."
          mood="happy"
        />
      ) : (
        <div className="pt-3">
          <DropGrid drops={answers} showScores />
        </div>
      )}

      {answering && (
        <AnswerSheet
          prompt={req.prompt}
          usedDropIds={new Set((answers ?? []).map((d) => d.id))}
          onAnswer={(drop) => {
            if (!user) return
            void answerWithDrop(req.id, drop.id, user.id).then((ok) => {
              setAnswering(false)
              if (ok) void load()
            })
          }}
          onClose={() => setAnswering(false)}
        />
      )}
    </div>
  )
}
