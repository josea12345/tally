import { supabase } from './supabase'

/**
 * Permanently delete the signed-in user's account. The delete-account
 * edge function resolves the caller from their JWT and deletes the auth
 * user; every public row cascades from there. The client signs out
 * afterwards (the session's user no longer exists).
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST', body: {} })
  if (!error) return { error: null }
  return { error: 'Could not delete your account — try again in a moment.' }
}
