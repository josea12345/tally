import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop } from '../lib/types'

const REASONS = [
  'Spam',
  'Harassment or bullying',
  'Inappropriate content',
  'Misinformation',
  'Something else',
]

/** Report-a-drop dialog: reason picker + optional details, bottom sheet. */
export default function ReportDialog({ drop, onClose }: { drop: Drop; onClose: () => void }) {
  const { user } = useAuth()
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!user || !reason || busy) return
    setBusy(true)
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      drop_id: drop.id,
      reported_user_id: drop.author_id,
      reason,
      details: details.trim() || null,
    })
    setBusy(false)
    if (!error) setSent(true)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="rise-in w-full max-w-sm rounded-3xl border border-line bg-ink-2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!sent ? (
          <>
            <h3 className="font-display text-xl font-bold">Report drop</h3>
            <p className="mt-1 text-xs text-mute">
              “{drop.title}” by @{drop.author?.username ?? 'someone'}
            </p>
            <div className="mt-4 space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-bold transition ${
                    reason === r
                      ? 'border-sig bg-sig/10 text-sig'
                      : 'border-line bg-ink-3 text-fog hover:border-mute'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything we should know? (optional)"
              rows={2}
              maxLength={500}
              className="mt-3 w-full resize-none rounded-xl border border-line bg-ink-3 px-3 py-2 text-sm outline-none placeholder:text-mute/60 focus:border-sig"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-line py-2.5 text-sm font-black text-fog"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!reason || busy}
                className="flex-1 rounded-full bg-sig py-2.5 text-sm font-black text-ink disabled:opacity-40"
              >
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="font-display text-xl font-bold">Thanks — we'll take a look.</p>
            <p className="mt-1 text-sm text-mute">Reports are reviewed against the community rules.</p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-sig py-2.5 text-sm font-black text-ink"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
