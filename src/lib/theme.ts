/** Light/dark theme. Styling keys off the `data-theme` attribute on <html>;
 * every color token in index.css has a light override, so components flip
 * automatically. Choice persists; "system" follows the OS. */

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'tally-theme'

export function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function getChoice(): ThemeChoice {
  const saved = localStorage.getItem(KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
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

/** Apply the saved (or system) theme. Call once on app start. */
export function initTheme() {
  applyTheme(resolveTheme(getChoice()))
}
