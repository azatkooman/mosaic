export const THEMES = ['system', 'light', 'dark']
export const THEME_COOKIE = 'mosaic-theme'

/** Normalize any stored value to a supported theme. */
export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system'
}

/**
 * Resolve the theme state every surface should display, from the two inputs
 * that decide it. Pure so it can be tested without a DOM; useThemeState wires
 * it to the live `data-theme` attribute and the prefers-color-scheme query.
 *
 * @param {string|undefined|null} attr  value of <html data-theme>, if any
 * @param {boolean} prefersDark         the OS prefers-color-scheme result
 * @returns {{preference: 'system'|'light'|'dark', applied: 'light'|'dark'}}
 *   `preference` is the user's choice; `applied` is what it resolves to now.
 */
export function resolveThemeState(attr, prefersDark) {
  const forced = attr === 'light' || attr === 'dark' ? attr : null
  return {
    preference: forced ?? 'system',
    applied: forced ?? (prefersDark ? 'dark' : 'light'),
  }
}

/**
 * Apply a theme to the document and persist it to the cookie the server reads
 * on the next render. 'system' clears the override (and the cookie) so the
 * device's prefers-color-scheme takes over. Client-only.
 */
export function applyThemeClient(theme) {
  const t = normalizeTheme(theme)
  const root = document.documentElement
  if (t === 'system') {
    delete root.dataset.theme
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
  } else {
    root.dataset.theme = t
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`
  }
}
