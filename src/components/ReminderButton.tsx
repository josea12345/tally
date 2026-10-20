import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

type Preset = { id: string; label: string; at: () => Date }

function atTime(d: Date, h: number, m: number): Date {
  const out = new Date(d)
  out.setHours(h, m, 0, 0)
  return out
}

const PRESETS: Preset[] = [
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    at: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      return atTime(d, 10, 0)
    },
  },
  {
    id: 'saturday',
    label: 'Saturday',
    at: () => {
      const d = new Date()
      let add = (6 - d.getDay() + 7) % 7
      const candidate = new Date(d)
      candidate.setDate(d.getDate() + add)
      if (add === 0 && atTime(candidate, 11, 0) <= new Date()) add = 7
      const out = new Date(d)
      out.setDate(d.getDate() + add)
      return atTime(out, 11, 0)
    },
  },
  {
    id: 'nextweek',
    label: 'Next week',
    at: () => {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      return atTime(d, 10, 0)
    },
  },
]

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d)
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d)
  return `${day} ${time}`
}

/**
 * "Remind me to try this" — one pending reminder per drop; the
 * database dispatches it into a notification (+push) when it's due.
 */
export default function ReminderButton({ dropId, slim }: { dropId: string; slim?: boolean }) {
  const { user } = useAuth()
  const [remindAt, setRemindAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setLoaded(true)
      return
    }
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('drop_reminders')
        .select('remind_at')
        .eq('user_id', user.id)
        .eq('drop_id', dropId)
        .maybeSingle()
      if (!live) return
      setRemindAt((data as { remind_at: string } | null)?.remind_at ?? null)
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [user?.id, dropId])

  if (!user || !loaded) return null

  const set = async (p: Preset) => {
    if (busy) return
    setBusy(true)
    const at = p.at()
    const { error } = await supabase.from('drop_reminders').upsert(
      { user_id: user.id, drop_id: dropId, remind_at: at.toISOString() },
      { onConflict: 'user_id,drop_id' },
    )
    setBusy(false)
    if (!error) {
      setRemindAt(at.toISOString())
      setOpen(false)
    }
  }

  const clear = async () => {
    if (busy) return
    setBusy(true)
    const { error } = await supabase
      .from('drop_reminders')
      .delete()
      .eq('user_id', user.id)
      .eq('drop_id', dropId)
    setBusy(false)
    if (!error) setRemindAt(null)
  }

  if (remindAt) {
    return slim ? (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-butter">
        {fmtWhen(remindAt)}
        <button onClick={clear} disabled={busy} aria-label="Cancel reminder" className="font-black text-mute hover:text-miss disabled:opacity-50">
          ✕
        </button>
      </span>
    ) : (
      <span className="flex items-center gap-2 rounded-full border border-butter/60 bg-ink-2 px-4 py-2 text-sm font-bold text-butter">
        Reminder · {fmtWhen(remindAt)}
        <button onClick={clear} disabled={busy} aria-label="Cancel reminder" className="font-black text-mute hover:text-miss disabled:opacity-50">
          ✕
        </button>
      </span>
    )
  }

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          slim
            ? 'shrink-0 text-[11px] font-bold text-mute transition hover:text-butter'
            : 'rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog transition hover:border-butter/70 hover:text-butter'
        }
      >
        Remind me
      </button>
      {open && (
        <span className="absolute left-0 top-11 z-40 flex w-44 flex-col overflow-hidden rounded-2xl border border-line bg-ink-3 shadow-2xl">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => set(p)}
              disabled={busy}
              className="px-4 py-2.5 text-left text-sm font-bold text-fog transition hover:bg-ink-2 disabled:opacity-50"
            >
              {p.label}
              <span className="block text-[11px] font-normal text-mute">{fmtWhen(p.at().toISOString())}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
