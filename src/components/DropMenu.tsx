import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop } from '../lib/types'
import { topicKeyFor } from '../lib/format'
import { shareDrop } from '../lib/share'
import { navigate } from '../App'
import ReportDialog from './ReportDialog'

/**
 * ··· menu on someone else's drop: report the drop, or block the author.
 * Blocking hides drops both ways (enforced in the database).
 */
export default function DropMenu({
  drop,
  onBlocked,
}: {
  drop: Drop
  onBlocked: (authorId: string) => void
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [sharedNote, setSharedNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const author = drop.author

  if (!user || !author || user.id === author.id) return null

  const close = () => {
    setOpen(false)
    setConfirming(false)
  }

  const block = async () => {
    if (busy) return
    setBusy(true)
    const { error } = await supabase
      .from('blocks')
      .insert({ blocker_id: user.id, blocked_id: author.id })
    setBusy(false)
    if (!error) {
      close()
      onBlocked(author.id)
    }
  }

  return (
    <span className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          setOpen((o) => !o)
          setConfirming(false)
        }}
        aria-label="More options"
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-black text-mute transition hover:bg-ink-3 hover:text-fog"
      >
        ···
      </button>
      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div className="absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-2xl border border-line bg-ink-3 shadow-2xl">
            {!confirming ? (
              <>
                <button
                  onClick={async () => {
                    const r = await shareDrop(drop)
                    if (r === 'copied') {
                      setSharedNote(true)
                      setTimeout(close, 700)
                    } else {
                      close()
                    }
                  }}
                  className="block w-full px-4 py-3 text-left text-sm font-bold text-fog transition hover:bg-ink-2"
                >
                  {sharedNote ? 'Link copied!' : 'Share drop'}
                </button>
                <button
                  onClick={() => {
                    const key = drop.topic_key ?? topicKeyFor(drop)
                    close()
                    navigate(`/topic/${encodeURIComponent(key)}`)
                  }}
                  className="block w-full border-t border-line px-4 py-3 text-left text-sm font-bold text-fog transition hover:bg-ink-2"
                >
                  All posts about this
                </button>
                <button
                  onClick={() => setReporting(true)}
                  className="block w-full border-t border-line px-4 py-3 text-left text-sm font-bold text-fog transition hover:bg-ink-2"
                >
                  Report drop
                </button>
                <button
                  onClick={() => setConfirming(true)}
                  className="block w-full border-t border-line px-4 py-3 text-left text-sm font-bold text-miss transition hover:bg-ink-2"
                >
                  Block @{author.username}
                </button>
              </>
            ) : (
              <div className="p-4">
                <p className="text-sm font-bold">Block @{author.username}?</p>
                <p className="mt-1 text-xs leading-relaxed text-mute">
                  You won't see their drops, and they won't see yours.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-full border border-line py-2 text-xs font-black text-fog"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={block}
                    disabled={busy}
                    className="flex-1 rounded-full bg-miss py-2 text-xs font-black text-ink disabled:opacity-50"
                  >
                    {busy ? 'Blocking…' : 'Block'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {reporting && (
        <ReportDialog
          drop={drop}
          onClose={() => {
            setReporting(false)
            close()
          }}
        />
      )}
    </span>
  )
}
