import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Validate the Supabase env config WITHOUT constructing a client.
 * Returns a human-readable error, or null when the config is usable.
 * Pure and exported so the failure modes are unit-testable — creating
 * a client with an empty/invalid URL throws inside supabase-js, which
 * used to take the whole app down at module init (white screen).
 */
export function validateSupabaseConfig(
  u: string | undefined,
  k: string | undefined,
): string | null {
  if (!u || !u.trim()) return 'VITE_SUPABASE_URL is missing.'
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return 'VITE_SUPABASE_URL is not a valid URL.'
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'VITE_SUPABASE_URL must be an http(s) URL.'
  }
  if (!k || !k.trim()) return 'VITE_SUPABASE_ANON_KEY is missing.'
  if (k.trim().length < 20) return 'VITE_SUPABASE_ANON_KEY looks too short to be a real key.'
  return null
}

export const supabaseConfigError = validateSupabaseConfig(url, anonKey)

if (supabaseConfigError) {
  // eslint-disable-next-line no-console
  console.warn(`[tally] Supabase is not configured: ${supabaseConfigError}`)
}

/**
 * The client. When the config is broken we still must not throw at
 * import time — dozens of modules import this file — so the client is
 * built against a syntactically valid but inert placeholder host.
 * main.tsx renders a configuration error screen in that case, so this
 * placeholder client is never actually used for a request.
 */
export const supabase = createClient(
  supabaseConfigError ? 'https://unconfigured.tally.invalid' : (url as string),
  supabaseConfigError ? 'unconfigured-placeholder-key-padding' : (anonKey as string),
)

export const isSupabaseConfigured = supabaseConfigError === null
