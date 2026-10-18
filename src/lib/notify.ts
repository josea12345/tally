import { supabase } from './supabase'

export type NotificationKind = 'W' | 'L' | 'follow' | 'comment' | 'approved' | 'requested'

export interface Notification {
  id: string
  user_id: string
  actor_id: string
  kind: NotificationKind
  drop_id: string | null
  read_at: string | null
  created_at: string
  actor?: { username: string; display_name: string | null; avatar_url: string | null }
  drop?: { title: string } | null
}

/**
 * Best-effort notification write. The recipient never notifies themselves.
 * Vote notifications replace any earlier vote from the same actor on the drop
 * (so flipping W→L doesn't stack).
 */
export async function notify(
  recipientId: string,
  actorId: string,
  kind: NotificationKind,
  dropId?: string | null,
): Promise<void> {
  if (!recipientId || recipientId === actorId) return
  try {
    if ((kind === 'W' || kind === 'L') && dropId) {
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', recipientId)
        .eq('actor_id', actorId)
        .eq('drop_id', dropId)
        .in('kind', ['W', 'L'])
    }
    if (kind === 'follow') {
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', recipientId)
        .eq('actor_id', actorId)
        .eq('kind', 'follow')
    }
    await supabase.from('notifications').insert({
      user_id: recipientId,
      actor_id: actorId,
      kind,
      drop_id: dropId ?? null,
    })
  } catch {
    // notifications are best-effort — never break the action that triggered them
  }
}
