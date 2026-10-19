/**
 * External-link safety, centralized.
 *
 * Every URL that becomes a clickable <a href> anywhere in the app must pass
 * through safeExternalUrl — it allows ONLY http:/https: and rejects
 * javascript:/data:/file:/vbscript: etc. Callers should drop (not render)
 * anything that comes back null.
 */

/** Only http(s) URLs may become clickable. Returns the normalized href, or null. */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * Normalize a user-pasted link: if it has no scheme at all ("example.com"),
 * assume https://. A present-but-dangerous scheme ("javascript:…") is left
 * alone so safeExternalUrl rejects it below.
 */
export function normalizePastedUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return t
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) ? t : `https://${t}`
}

/** Service-affiliated labels must match the hostname they imply; otherwise
 *  the chip falls back to the honest generic label. */
const SERVICE_HOSTS: Record<string, RegExp> = {
  IMDb: /(^|\.)imdb\.com$/i,
  TMDB: /(^|\.)themoviedb\.org$/i,
  'Rotten Tomatoes': /(^|\.)rottentomatoes\.com$/i,
  Spotify: /(^|\.)spotify\.com$/i,
}

export function honestLinkLabel(label: string | null | undefined, url: string): string {
  if (!label) return 'Link'
  const re = SERVICE_HOSTS[label]
  if (!re) return label // generic labels ('Link', 'Official site', 'View location') pass through
  try {
    return re.test(new URL(url).hostname) ? label : 'Link'
  } catch {
    return 'Link'
  }
}
