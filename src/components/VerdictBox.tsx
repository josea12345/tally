import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Category, Drop, DropStats, Verdict } from '../lib/types'
import { navigate } from '../App'

const TRIED_COPY: Record<string, string> = {
  movies: 'I watched it — mark as tried',
  tv: 'I watched it — mark as tried',
  music: 'I listened — mark as tried',
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

/** Tried-gate → HIT/MISS → animated poll bar → "Called it" payoff. */
export default function VerdictBox({ drop, stats, myVerdict, onChanged }: Props) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [justVoted, setJustVoted] = useState<'HIT' | 'MISS' | null>(null)

  const total = stats.hits + stats.misses
  const hitPct = total === 0 ? 50 : Math.round((stats.hits / total) * 100)

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

  const vote = async (verdict: 'HIT' | 'MISS') => {
    if (!requireAuth() || !user) return
    setBusy(true)
    try {
      // Tried-gate: must be tried before a verdict counts.
      const { error } = await supabase.from('verdicts').upsert(
        { user_id: user.id, drop_id: drop.id, tried: true, verdict },
        { onConflict: 'user_id,drop_id' }
      )
      if (error) throw error
      setJustVoted(verdict)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const tried = !!myVerdict?.tried

  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-4">
      <div className="mb-1 text-sm font-black">Was the put-on worth it?</div>
      <p className="mb-3 text-xs text-mute">
        {total === 0
          ? 'No verdicts yet — be the first to call it.'
          : `${total} ${total === 1 ? 'verdict' : 'verdicts'} · ${hitPct}% say it lived up to the drop`}
      </p>

      {/* poll-style split bar */}
      <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-ink-3">
        <div className="poll-fill bg-lime" style={{ width: `${hitPct}%` }} />
        <div className="poll-fill bg-miss" style={{ width: `${100 - hitPct}%` }} />
      </div>
      <div className="mb-4 flex justify-between text-xs font-bold">
        <span className="text-lime">HIT · {stats.hits}</span>
        <span className="text-miss">MISS · {stats.misses}</span>
      </div>

      {justVoted && (
        <div className="banner-pop mb-4 rounded-xl bg-lime px-4 py-3 text-sm font-black text-ink">
          {justVoted === 'HIT' ? 'Called it: HIT. They put you on.' : 'Called it: MISS. Honest — that’s the game.'}
        </div>
      )}

      {!tried ? (
        <button
          onClick={markTried}
          disabled={busy}
          className="w-full rounded-full border border-lime px-4 py-3 text-sm font-black text-lime transition hover:bg-lime hover:text-ink disabled:opacity-50"
        >
          {triedLabel(drop.category)}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => vote('HIT')}
            disabled={busy}
            className={`rounded-full px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
              myVerdict?.verdict === 'HIT' ? 'bg-lime text-ink' : 'border border-line bg-ink-3 text-lime hover:border-lime'
            }`}
          >
            HIT{myVerdict?.verdict === 'HIT' ? ' ✓' : ''}
          </button>
          <button
            onClick={() => vote('MISS')}
            disabled={busy}
            className={`rounded-full px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
              myVerdict?.verdict === 'MISS' ? 'bg-miss text-ink' : 'border border-line bg-ink-3 text-miss hover:border-miss'
            }`}
          >
            MISS{myVerdict?.verdict === 'MISS' ? ' ✓' : ''}
          </button>
        </div>
      )}
      {tried && <p className="mt-2 text-center text-[11px] text-mute">You can change your verdict anytime.</p>}
    </div>
  )
}
