import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Notification } from '../lib/notify'
import { Avatar, navigate } from '../App'
import { timeAgo } from '../lib/format'
import EmptyState from '../components/EmptyState'
import ChatIcon from '../components/ChatIcon'

/** Playful accent chip per notification kind — original sticker language, no emoji. */
function KindChip({ kind }: { kind: Notification['kind'] }) {
  const base =
    'flex h-9 w-9 shrink-0 -rotate-3 items-center justify-center rounded-xl border-2 border-[#191725] text-sm font-black shadow-[2px_2px_0_rgba(0,0,0,0.3)]'
  switch (kind) {
    case 'W':
      return <span className={`${base} bg-win text-[#191725]`} aria-hidden>W</span>
    case 'L':
      return <span className={`${base} bg-miss text-white`} aria-hidden>L</span>
    case 'follow':
      return <span className={`${base} bg-sig text-[var(--color-sig-ink)]`} aria-hidden>+</span>
    case 'approved':
      return <span className={`${base} bg-lilac text-[#191725]`} aria-hidden>✓</span>
    case 'requested':
      return <span className={`${base} bg-butter text-[#191725]`} aria-hidden>?</span>
    case 'comment':
      return (
        <span className={`${base} bg-sky text-[#191725]`} aria-hidden>
          <ChatIcon className="h-5 w-5" />
        </span>
      )
    case 'mention':
      return <span className={`${base} bg-lilac text-[#191725]`} aria-hidden>@</span>
    case 'like':
      return (
        <span className={`${base} bg-butter text-[#191725]`} aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M4 5v14M9.3 5v14M14.6 5v14M19.9 5v14M3 17.5 21 6.5" />
          </svg>
        </span>
      )
  }
}

function textFor(n: Notification): string {
  const name = n.actor?.display_name || `@${n.actor?.username ?? 'someone'}`
  switch (n.kind) {
    case 'W':
      return `${name} called W on your drop`
    case 'L':
      return `${name} called L on your drop`
    case 'follow':
      return `${name} followed you`
    case 'comment':
      return `${name} commented on your drop`
    case 'mention':
      return `${name} mentioned you in a comment`
    case 'like':
      return `${name} liked your comment`
    case 'approved':
      return `${name} approved your follow request`
    case 'requested':
      return `${name} requested to follow you`
  }
}

export default function Notifications() {
  const { user } = useAuth()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('notifications')
        .select(
          '*, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url), drop:drops!notifications_drop_id_fkey(title)',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60)
      if (!live) return
      setItems((data ?? []) as Notification[])
      setLoading(false)
      // Seen = read, like X/IG.
      const unreadIds = ((data ?? []) as Notification[]).filter((n) => !n.read_at).map((n) => n.id)
      if (unreadIds.length > 0) {
        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      }
    })()
    return () => {
      live = false
    }
  }, [user])

  const open = (n: Notification) => {
    if (n.drop_id) navigate(`/drop/${n.drop_id}`)
    else navigate(`/profile/${n.actor_id}`)
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 px-4 py-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-ink-3" />
            <div className="h-4 flex-1 rounded bg-ink-3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="text-2xl font-black tracking-tight">Notifications</h1>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="No tea right now"
          body="Votes, follows, and comments on your drops will land here."
          mood="happy"
          action={
            <button
              onClick={() => navigate('/')}
              className="btn-pop press px-6 py-2.5 text-sm"
            >
              Back to Discover
            </button>
          }
        />
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-2">
                <Avatar url={n.actor?.avatar_url ?? null} name={n.actor?.display_name ?? n.actor?.username ?? '?'} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">
                    {textFor(n)}
                    {n.drop?.title && n.drop_id && (
                      <span className="text-mute"> — “{n.drop.title}”</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-mute">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sig" aria-label="Unread" />}
                <KindChip kind={n.kind} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
