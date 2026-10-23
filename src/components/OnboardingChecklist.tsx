import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'

const DISMISS_KEY = 'tally-checklist-dismissed'

/**
 * New-user setup checklist for the feed: five steps that teach the loop
 * (photo → drop → bet → rate → follow). Auto-hides when all five are
 * done or when dismissed (remembered per device). Steps without a
 * destination just check themselves off as the user does them in the feed.
 */
export default function OnboardingChecklist() {
  const { user, profile } = useAuth()
  const [counts, setCounts] = useState<{ drops: number; saves: number; ratings: number; follows: number } | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!user || dismissed) return
    let live = true
    ;(async () => {
      const [d, s, v, f] = await Promise.all([
        supabase.from('drops').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
        supabase.from('saves').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('drop_ratings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
      ])
      if (!live) return
      setCounts({ drops: d.count ?? 0, saves: s.count ?? 0, ratings: v.count ?? 0, follows: f.count ?? 0 })
    })()
    return () => {
      live = false
    }
  }, [user, dismissed])

  if (!user || dismissed || !counts) return null

  const steps: Array<{ id: string; label: string; done: boolean; action?: () => void }> = [
    {
      id: 'photo',
      label: 'Add a profile photo',
      done: !!profile?.avatar_url,
      action: () => navigate(`/profile/${user.id}`),
    },
    { id: 'drop', label: 'Drop your first put-on', done: counts.drops > 0, action: () => navigate('/camera') },
    { id: 'bet', label: 'Bet on something that looks good', done: counts.saves > 0 },
    { id: 'rate', label: 'Rate something — type your score', done: counts.ratings > 0 },
    { id: 'follow', label: 'Follow someone with taste', done: counts.follows > 0, action: () => navigate('/search') },
  ]
  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode — dismissal just won't persist */
    }
    setDismissed(true)
  }

  return (
    <div className="mx-4 mb-2 mt-3 rounded-2xl border border-sig/30 bg-ink-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-fog">
          Get set up · {doneCount} of {steps.length}
        </span>
        <button
          onClick={dismiss}
          aria-label="Dismiss setup checklist"
          className="flex h-6 w-6 items-center justify-center rounded-full text-mute transition hover:text-fog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink-3">
        <div
          className="h-full rounded-full bg-sig transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <div className="space-y-1">
        {steps.map((s) => {
          const row = (
            <>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  s.done ? 'bg-win text-ink' : 'border-2 border-line'
                }`}
              >
                {s.done && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} className="h-3 w-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`flex-1 text-sm font-bold ${s.done ? 'text-mute line-through' : 'text-fog'}`}>
                {s.label}
              </span>
              {!s.done && s.action && <span className="text-sm font-black text-sig">→</span>}
            </>
          )
          return s.action && !s.done ? (
            <button key={s.id} onClick={s.action} className="press flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left">
              {row}
            </button>
          ) : (
            <div key={s.id} className="flex items-center gap-2.5 px-1 py-1.5">
              {row}
            </div>
          )
        })}
      </div>
    </div>
  )
}
