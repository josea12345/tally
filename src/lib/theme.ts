/** Light/dark theme. Styling keys off the `data-theme` attribute on <html>;
 * every color token in index.css has a light override, so components flip
 * automatically. Choice persists; "system" follows the OS. The default
 * (no saved choice) is light. */

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'tally-theme'

export function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'light'
  }
}

export function getChoice(): ThemeChoice {
  // One-time reset (Oct 2026): 'system' used to be the default, so most
  // saved 'system' values were never a deliberate pick. Light is now the
  // default for everyone, so clear an inherited 'system' once and land
  // those users on light. Explicit dark picks are untouched, and anyone
  // can re-pick System afterwards — the v2 flag stops a second reset.
  if (!localStorage.getItem('tally-theme-v2')) {
    if (localStorage.getItem(KEY) === 'system') localStorage.removeItem(KEY)
    localStorage.setItem('tally-theme-v2', '1')
  }
  const saved = localStorage.getItem(KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light'
}

export function resolveTheme(c: ThemeChoice): ResolvedTheme {
  return c === 'system' ? systemTheme() : c
}

export function applyTheme(t: ResolvedTheme) {
  document.documentElement.dataset.theme = t
  document.documentElement.style.colorScheme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'light' ? '#fffcf7' : '#191725')
}

/** Persist the choice and apply it immediately. */
export function setChoice(c: ThemeChoice) {
  localStorage.setItem(KEY, c)
  applyTheme(resolveTheme(c))
}

/** Apply the saved theme, or the light default. Call once on app start. */
export function initTheme() {
  applyTheme(resolveTheme(getChoice()))
}
