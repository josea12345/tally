export type NotificationKind = 'W' | 'L' | 'follow' | 'comment' | 'approved' | 'requested' | 'mention' | 'like' | 'reminder' | 'recap'

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
 * Notifications are created SERVER-SIDE by database triggers (migration
 * 0033) from real events — a verdict, a comment, a follow, a request, an
 * approval — with the recipient's preferences applied there. Client-side
 * writes are locked by RLS, so an alert can no longer be forged.
 *
 * These helpers used to write the rows directly; they stay as no-ops so
 * every existing call site keeps compiling while the triggers own
 * creation. unnotifyVote likewise: a verdict DELETE trigger removes the
 * vote notification.
 */
export async function notify(
  recipientId: string,
  actorId: string,
  kind: NotificationKind,
  dropId?: string | null,
): Promise<void> {
  void recipientId
  void actorId
  void kind
  void dropId
}

export async function unnotifyVote(recipientId: string, actorId: string, dropId: string): Promise<void> {
  void recipientId
  void actorId
  void dropId
}
