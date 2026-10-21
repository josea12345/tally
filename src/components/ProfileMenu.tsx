import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'

const REASONS = ['Spam', 'Harassment', 'Impersonation', 'Something else']

/**
 * ··· menu on someone else's profile — report the account or block
 * them outright. Blocks are enforced both-ways at the database level.
 */
export default function ProfileMenu({
  targetId,
  handle,
}: {
  targetId: string
  handle: string
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'menu' | 'report' | 'block'>('menu')
  const [reason, setReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (!user || user.id === targetId) return null

  const close = () => {
    setOpen(false)
    setMode('menu')
    setReason(null)
    setSent(false)
  }

  const submitReport = async () => {
    if (!reason || busy) return
    setBusy(true)
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_user_id: targetId,
      reason,
    })
    setBusy(false)
    if (!error) setSent(true)
  }

  const block = async () => {
    if (busy) return
    setBusy(true)
    const { error } = await supabase
      .from('blocks')
      .insert({ blocker_id: user.id, blocked_id: targetId })
    setBusy(false)
    if (!error) {
      close()
      navigate('/')
    }
  }

  return (
    <span className="relative shrink-0">
      <button
        onClick={() => {
          setOpen((o) => !o)
          setMode('menu')
        }}
        aria-label="More options"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-base font-black text-mute transition hover:text-fog"
      >
        ···
      </button>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} onClick={close} className="fixed inset-0 z-40 cursor-default bg-transparent" />
          <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-2xl border border-line bg-ink-3 p-1.5 shadow-2xl">
            {mode === 'menu' && (
              <>
                <button
                  onClick={() => setMode('report')}
                  className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-fog transition hover:bg-ink-2"
                >
                  Report @{handle}
                </button>
                <button
                  onClick={() => setMode('block')}
                  className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-miss transition hover:bg-ink-2"
                >
                  Block @{handle}
                </button>
              </>
            )}
            {mode === 'report' &&
              (sent ? (
                <div className="px-3 py-3">
                  <p className="text-sm font-bold">Reported — thank you.</p>
                  <p className="mt-1 text-xs text-mute">A human reviews every report.</p>
                  <button onClick={close} className="mt-3 rounded-full bg-sig px-4 py-1.5 text-xs font-black text-ink">
                    Done
                  </button>
                </div>
              ) : (
                <div className="px-2 py-2">
                  <p className="px-1 pb-2 text-xs font-black uppercase tracking-wider text-mute">
                    Why are you reporting @{handle}?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setReason(r)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                          reason === r ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={submitReport}
                    disabled={!reason || busy}
                    className="mt-3 w-full rounded-full bg-miss py-2 text-sm font-black text-white disabled:opacity-40"
                  >
                    {busy ? 'Sending…' : 'Send report'}
                  </button>
                </div>
              ))}
            {mode === 'block' && (
              <div className="px-3 py-3">
                <p className="text-sm font-bold">Block @{handle}?</p>
                <p className="mt-1 text-xs leading-relaxed text-mute">
                  They won't see your drops and you won't see theirs. You can unblock in Settings.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={block}
                    disabled={busy}
                    className="flex-1 rounded-full bg-miss py-2 text-sm font-black text-white disabled:opacity-50"
                  >
                    {busy ? 'Blocking…' : 'Block'}
                  </button>
                  <button onClick={() => setMode('menu')} className="flex-1 rounded-full border border-line py-2 text-sm font-black">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </span>
  )
}
