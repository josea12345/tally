import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

/** Live unread-notification count for the nav badge. */
export function useUnreadCount() {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) {
      setUnread(0)
      return
    }
    let live = true
    const load = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)
      if (live) setUnread(count ?? 0)
    }
    load()
    const ch = supabase
      .channel(`notif-badge-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnread((u) => u + 1),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe()
    return () => {
      live = false
      supabase.removeChannel(ch)
    }
  }, [user?.id])

  return unread
}
