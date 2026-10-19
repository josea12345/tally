import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Category, Drop, DropStats, Verdict } from '../lib/types'
import { navigate } from '../App'
import { notify, unnotifyVote } from '../lib/notify'

const TRIED_COPY: Record<string, string> = {
  movies: 'I watched it — mark as tried',
  tv: 'I watched it — mark as tried',
  music: 'I listened — mark as tried',
  recipes: 'I cooked it — mark as tried',
}

function triedLabel(category: Category): string {
  return TRIED_COPY[category] ?? 'I tried it — mark as tried'
}

interface Props {
  drop: Drop
  stats: DropStats
  myVerdict: Verdict | null
  onChanged: () => void
}

/** Tried-gate → W/L → animated poll bar → "Called it" payoff. */
export default function VerdictBox({ drop, stats, myVerdict, onChanged }: Props) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [justVoted, setJustVoted] = useState<'W' | 'L' | null>(null)

  const total = stats.wins + stats.losses
  const winPct = total === 0 ? 50 : Math.round((stats.wins / total) * 100)

  const requireAuth = () => {
    if (!user) {
      navigate('/auth')
      return false
    }
    return true
  }

  const markTried = async () => {
    if (!requireAuth() || !user) return
    setBusy(true)
    try {
      const { error } = await supabase.from('verdicts').upsert(
        { user_id: user.id, drop_id: drop.id, tried: true },
        { onConflict: 'user_id,drop_id' }
      )
      if (error) throw error
      setJustVoted(null)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const vote = async (verdict: 'W' | 'L') => {
    if (!requireAuth() || !user) return
    setBusy(true)
    try {
      if (myVerdict?.verdict === verdict) {
        // Retract: tapping the active verdict again takes the call back.
        const { error } = await supabase
          .from('verdicts')
          .update({ verdict: null })
          .eq('user_id', user.id)
          .eq('drop_id', drop.id)
        if (error) throw error
        setJustVoted(null)
        void unnotifyVote(drop.author_id, user.id, drop.id)
      } else {
        // Tried-gate: must be tried before a verdict counts.
        const { error } = await supabase.from('verdicts').upsert(
          { user_id: user.id, drop_id: drop.id, tried: true, verdict },
          { onConflict: 'user_id,drop_id' }
        )
        if (error) throw error
        setJustVoted(verdict)
        void notify(drop.author_id, user.id, verdict, drop.id)
      }
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const tried = !!myVerdict?.tried
  const isAuthor = !!user && user.id === drop.author_id

  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-4">
      <div className="mb-1 text-sm font-black">Was the put-on worth it?</div>
      <p className="mb-3 text-xs text-mute">
        {total === 0
          ? 'No verdicts yet — be the first to call it.'
          : `${total} ${total === 1 ? 'verdict' : 'verdicts'} · ${winPct}% took the W`}
      </p>

      {/* poll-style split bar */}
      <div className="mb-4 flex h-3.5 overflow-hidden rounded-full bg-ink-3">
        <div
          className={`poll-fill ${winPct >= 50 ? 'glow-win' : ''} bg-win`}
          style={{ width: `${winPct}%`, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }}
        />
        <div
          className={`poll-fill ${winPct < 50 ? 'glow-loss' : ''} bg-miss`}
          style={{ width: `${100 - winPct}%`, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </div>
      <div className="mb-4 flex justify-between text-xs font-bold">
        <span className="text-win">W · {stats.wins}</span>
        <span className="text-miss">L · {stats.losses}</span>
      </div>

      {justVoted && (
        <div className="pop-in sticker-sm mb-4 rounded-2xl bg-sig px-4 py-3 text-sm font-black text-[var(--color-sig-ink)]">
          {justVoted === 'W' ? 'Called it: W. They put you on.' : 'Called it: L. Honest — that’s the game.'}
        </div>
      )}

      {isAuthor ? (
        <p className="text-center text-xs text-mute">
          This is your drop — only other people's verdicts count toward your Taste Score.
        </p>
      ) : (
        <>
          {!tried ? (
            <button
              onClick={markTried}
              disabled={busy}
              className="press w-full rounded-full border border-sig px-4 py-3 text-sm font-black text-sig transition hover:bg-sig hover:text-ink disabled:opacity-50"
            >
              {triedLabel(drop.category)}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => vote('W')}
                disabled={busy}
                className={`press rounded-full px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
                  myVerdict?.verdict === 'W' ? 'verdict-slam bg-win text-ink' : 'border border-line bg-ink-3 text-win hover:border-win'
                }`}
              >
                W{myVerdict?.verdict === 'W' ? ' ✓' : ''}
              </button>
              <button
                onClick={() => vote('L')}
                disabled={busy}
                className={`press rounded-full px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
                  myVerdict?.verdict === 'L' ? 'verdict-slam bg-miss text-ink' : 'border border-line bg-ink-3 text-miss hover:border-miss'
                }`}
              >
                L{myVerdict?.verdict === 'L' ? ' ✓' : ''}
              </button>
            </div>
          )}
          {tried && <p className="mt-2 text-center text-[11px] text-mute">You can change your verdict anytime.</p>}
        </>
      )}
    </div>
  )
}
