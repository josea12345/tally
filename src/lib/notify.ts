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
 * Respects the recipient's notification preferences (fail-open: if prefs can't
 * be read, the notification still goes through). Vote notifications replace any
 * earlier vote from the same actor on the drop (so flipping W→L doesn't stack).
 */
export async function notify(
  recipientId: string,
  actorId: string,
  kind: NotificationKind,
  dropId?: string | null,
): Promise<void> {
  if (!recipientId || recipientId === actorId) return
  try {
    // Preference gate: skip kinds the recipient turned off.
    const prefCol =
      kind === 'W' || kind === 'L'
        ? 'notify_wl'
        : kind === 'comment'
          ? 'notify_comments'
          : 'notify_follows'
    const { data: pref, error: prefErr } = await supabase
      .from('profiles')
      .select(`${prefCol}`)
      .eq('id', recipientId)
      .maybeSingle()
    if (!prefErr && pref && (pref as Record<string, boolean>)[prefCol] === false) return

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

/** Remove a vote notification (e.g. the voter retracted their call). */
export async function unnotifyVote(
  recipientId: string,
  actorId: string,
  dropId: string,
): Promise<void> {
  if (!recipientId || recipientId === actorId) return
  try {
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', recipientId)
      .eq('actor_id', actorId)
      .eq('drop_id', dropId)
      .in('kind', ['W', 'L'])
  } catch {
    // best-effort
  }
}
