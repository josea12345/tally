import { supabase } from './supabase'

/**
 * Email-link landing handling — runs BEFORE the Supabase client is created
 * (see main.tsx), because a confirmation link's session arrives in the SAME
 * URL fragment this app uses for hash routing:
 *
 *   success: /#access_token=...&refresh_token=...&type=signup
 *   failure: /#error=access_denied&error_code=otp_expired&error_description=...
 *
 * Two things go wrong if the app just boots on that URL:
 *
 * 1. Cold-cache black screen. The fragment inflates the URL to ~2 KB. A
 *    service worker that uses the request URL verbatim as a cache key
 *    (older SW versions did) can then exceed the Cache Storage quota on
 *    iOS Safari, REJECT cache.put — and if that rejection escapes the
 *    respondWith promise, the navigation fails: a black screen instead
 *    of the app. Capturing the session into storage and cleaning the URL
 *    BEFORE the app (and its service worker) sees it removes the whole
 *    class, independent of which SW version a phone is still running.
 *
 * 2. Silent dead ends. A failed link (expired, already used, app-resume
 *    prefetch that burned the one-time token) used to land the user on
 *    the marketing page with the error stranded invisibly in the
 *    fragment. We surface it on the auth form instead, with a way to
 *    request a fresh link.
 */

const ERROR_KEY = 'peak-auth-link-error'

/** The gotrue storage key for the default storage key (project ref). */
function sessionStorageKey(): string | null {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL as string)
    return `sb-${url.hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }
}

/** True when the fragment carries an auth-link payload worth handling. */
function authFragmentParams(): URLSearchParams | null {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw.includes('access_token=') && !raw.includes('error=')) return null
  return new URLSearchParams(raw)
}

/**
 * If this load is an email-link landing, deal with it and return true —
 * the caller should reload the app on the clean root URL so everything
 * (router, service worker, auth) boots on an ordinary URL.
 */
export function consumeAuthLinkLanding(): boolean {
  let params: URLSearchParams | null
  try {
    params = authFragmentParams()
  } catch {
    return false
  }
  if (!params) return false

  // Failure landing: stash a human message for the auth form, then reload
  // clean. The wording is ours; the error_description from the URL is
  // developer-speak and stays out of the UI.
  if (params.get('error')) {
    try {
      const code = params.get('error_code') ?? ''
      const message =
        code === 'otp_expired' || code === 'access_denied'
          ? 'That confirmation link expired or was already used. Enter your email and we’ll send a fresh one.'
          : 'That sign-in link didn’t work. Enter your email and we’ll send a fresh one.'
      sessionStorage.setItem(ERROR_KEY, message)
    } catch {
      /* storage unavailable — the clean reload still applies */
    }
    window.location.replace(window.location.origin + window.location.pathname)
    return true
  }

  // Success landing: hand the session to gotrue's storage in its own
  // format, so its getSession() finds it exactly as if it had parsed
  // the URL itself.
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const key = sessionStorageKey()
  if (accessToken && refreshToken && key) {
    try {
      const expiresIn = Number(params.get('expires_in') ?? '3600')
      const expiresAt = Number(params.get('expires_at') ?? String(Math.floor(Date.now() / 1000) + expiresIn))
      const parts = accessToken.split('.')
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: params.get('token_type') ?? 'bearer',
        expires_in: expiresIn,
        expires_at: expiresAt,
        user: {
          id: payload.sub,
          aud: payload.aud ?? 'authenticated',
          role: payload.role ?? 'authenticated',
          email: payload.email ?? '',
          phone: payload.phone ?? '',
          app_metadata: payload.app_metadata ?? {},
          user_metadata: payload.user_metadata ?? {},
          identities: [],
          created_at: new Date((payload.iat ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          updated_at: new Date((payload.iat ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          is_anonymous: false,
        },
      }
      localStorage.setItem(key, JSON.stringify(session))
    } catch {
      /* A malformed capture just falls through to a clean reload —
         the session is lost but the app must still boot logged-out
         rather than hang on a fragment it can't digest. */
    }
  }
  window.location.replace(window.location.origin + window.location.pathname)
  return true
}

/** Read (and clear) the stashed email-link error message, if any. */
export function takeAuthLinkError(): string | null {
  try {
    const msg = sessionStorage.getItem(ERROR_KEY)
    if (msg) sessionStorage.removeItem(ERROR_KEY)
    return msg
  } catch {
    return null
  }
}

/** Re-send a signup confirmation link to this email address. */
export async function resendConfirmation(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/` },
  })
  return { error: error ? error.message : null }
}
