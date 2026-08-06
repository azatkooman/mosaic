'use client'

import { useEffect, useState } from 'react'
import { resolveThemeState } from './theme'

/**
 * Observe the theme that is actually in force, from anywhere in the tree.
 *
 * `data-theme` on <html> is the single source of truth: the server sets it
 * from the cookie, and applyThemeClient rewrites it. The header toggle and
 * the profile's Appearance dropdown both display that state, and each used to
 * read it on its own — the profile watched the attribute for changes, the
 * toggle only sampled it once on mount. Since the header lives in the layout
 * it never remounts on navigation, so choosing a theme in the profile turned
 * the site dark while the toggle went on showing a sun. Deriving both from
 * this hook means they cannot drift apart again.
 *
 * @returns {{preference: 'system'|'light'|'dark'|null, applied: 'light'|'dark'|null}}
 *   `preference` is what the user chose ('system' when nothing is forced);
 *   `applied` is what that resolves to right now, following the OS setting
 *   while the preference is 'system'. Both are null until mounted, so the
 *   first client render matches the server's.
 */
export function useThemeState() {
  const [state, setState] = useState({ preference: null, applied: null })

  useEffect(() => {
    const el = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const read = () => setState(resolveThemeState(el.dataset.theme, media.matches))

    read()
    const observer = new MutationObserver(read)
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    // Only matters while the preference is 'system', but harmless otherwise —
    // it keeps the icon honest if the OS flips at sunset.
    media.addEventListener('change', read)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', read)
    }
  }, [])

  return state
}
