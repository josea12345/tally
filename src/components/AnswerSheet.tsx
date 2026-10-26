import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop } from '../lib/types'
import { dropMedia } from '../lib/types'
import { navigate } from '../App'
import { PeakMark } from './PeakWordmark'

/**
 * Answer a put-on request with one of YOUR drops — a put-on is your
 * endorsement, so answers come from your own posts. Drops already
 * offered on this request are excluded by the parent.
 */
export default function AnswerSheet({
  prompt,
  usedDropIds,
  onAnswer,
  onClose,
}: {
  prompt: string
  usedDropIds: Set<string>
  onAnswer: (drop: Drop) => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const [mine, setMine] = useState<Drop[] | null>(null)

  useEffect(() => {
    if (!user) return
    let live = true
    void (async () => {
      const { data } = await supabase
        .from('drops')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (live) setMine(((data ?? []) as Drop[]).filter((d) => !usedDropIds.has(d.id)))
    })()
    return () => {
      live = false
    }
  }, [user, usedDropIds])

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Answer with your drop">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="animate-[pop-in_.25s_ease-out] absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-[26px] border-t border-line bg-ink-2 px-5 pb-10 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <p className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-mute">Put them on with</p>
        <p className="mt-1 truncate text-center text-base font-bold">{prompt}</p>
        <div className="mt-4 max-h-[45vh] space-y-1 overflow-y-auto">
          {mine === null ? (
            <div className="space-y-2 py-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-ink-3" />
              ))}
            </div>
          ) : mine.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-mute">
                {usedDropIds.size > 0
                  ? 'All your drops are already on this one.'
                  : "You haven't posted a drop yet — your first put-on could answer this."}
              </p>
              <button
                onClick={() => {
                  onClose()
                  navigate('/create')
                }}
                className="btn-pop press mt-3 rounded-full px-5 py-2.5 text-sm"
              >
                Post a drop
              </button>
            </div>
          ) : (
            mine.map((d) => {
              const first = dropMedia(d)[0]
              const cover = first ? (first.type === 'video' ? first.posterUrl : first.url) : null
              return (
                <button
                  key={d.id}
                  onClick={() => onAnswer(d)}
                  className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-ink-3"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-3 text-mute/50">
                    {cover ? (
                      <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <PeakMark className="h-5 w-auto" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{d.title}</span>
                    <span className="block truncate text-[11px] text-mute">
                      {[d.neighborhood, d.city].filter(Boolean).join(' · ') || d.category}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
