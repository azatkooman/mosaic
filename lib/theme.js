export const THEMES = ['system', 'light', 'dark']
export const THEME_COOKIE = 'mosaic-theme'

/** Normalize any stored value to a supported theme. */
export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system'
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
