import { supabase } from './supabase'
import { notify } from './notify'

const KEY = 'tally-invite-ref'

/**
 * Invite links carry the inviter: https://tally…/?ref=<username>#/auth
 * Landing on one stashes the username; when a brand-new account finishes
 * onboarding, consumeInviteRef auto-follows the inviter (or sends a
 * follow request if they're private) and the inviter gets the usual
 * follow/request notification. One-shot: the ref is cleared on use.
 */
export function captureInviteRef(): void {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('ref')
    const hashQuery = window.location.hash.split('?')[1]
    const fromHash = hashQuery ? new URLSearchParams(hashQuery).get('ref') : null
    const ref = (fromSearch || fromHash || '').trim().toLowerCase()
    if (ref) localStorage.setItem(KEY, ref)
  } catch {
    // storage unavailable — invites just behave like normal signups
  }
}

export function dropInviteRef(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export async function consumeInviteRef(userId: string): Promise<void> {
  let ref: string | null = null
  try {
    ref = localStorage.getItem(KEY)
  } catch {
    return
  }
  if (!ref) return
  try {
    const { data: inviter, error } = await supabase
      .from('profiles')
      .select('id, is_private')
      .ilike('username', ref)
      .maybeSingle()
    if (error) return // transient failure — keep the ref for the next launch
    if (!inviter) {
      dropInviteRef()
      return
    }
    const inv = inviter as { id: string; is_private: boolean }
    if (inv.id === userId) {
      dropInviteRef()
      return
    }
    const [{ data: existingFollow }, { data: existingRequest }] = await Promise.all([
      supabase.from('follows').select('id').eq('follower_id', userId).eq('followee_id', inv.id).maybeSingle(),
      supabase
        .from('follow_requests')
        .select('follower_id')
        .eq('follower_id', userId)
        .eq('followee_id', inv.id)
        .maybeSingle(),
    ])
    if (!existingFollow && !existingRequest) {
      if (inv.is_private) {
        const { error: insErr } = await supabase
          .from('follow_requests')
          .insert({ follower_id: userId, followee_id: inv.id })
        if (!insErr) void notify(inv.id, userId, 'requested')
      } else {
        const { error: insErr } = await supabase
          .from('follows')
          .insert({ follower_id: userId, followee_id: inv.id })
        if (!insErr) void notify(inv.id, userId, 'follow')
      }
    }
    dropInviteRef()
  } catch {
    // keep the ref — a later launch can retry
  }
}
