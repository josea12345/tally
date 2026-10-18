import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Notification } from '../lib/notify'
import { Avatar, navigate } from '../App'
import { timeAgo } from '../lib/format'
import EmptyState from '../components/EmptyState'

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
          title="All quiet"
          body="Votes, follows, and comments on your drops will land here."
          action={
            <button
              onClick={() => navigate('/')}
              className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink"
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
                {!n.read_at && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lime" />}
                <span className="shrink-0 text-lg" aria-hidden>
                  {n.kind === 'W' ? '✅' : n.kind === 'L' ? '❌' : n.kind === 'follow' ? '➕' : n.kind === 'approved' ? '🤝' : n.kind === 'requested' ? '🙋' : '💬'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
