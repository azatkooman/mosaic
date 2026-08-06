'use client'

import { applyThemeClient } from '@/lib/theme'
import { useThemeState } from '@/lib/use-theme-state'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/** Header light/dark toggle. The icon is derived from the theme actually in
 *  force rather than from local state, so it stays correct when the theme is
 *  changed somewhere else — Profile → Appearance, or the OS switching while
 *  the preference is 'system'. Flipping it persists via applyThemeClient
 *  (cookie + attribute → no flash on the next server render) and, when signed
 *  in, to the profile. */
export function ThemeToggle({ label }) {
  const { applied } = useThemeState()
  const dark = applied === 'dark'
  const supabase = getSupabaseBrowserClient()

  async function toggle() {
    const next = dark ? 'light' : 'dark'
    // Sets data-theme, which useThemeState observes — no local state to keep.
    applyThemeClient(next)
    // Keep the profile's Appearance setting in sync (signed-in users only).
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ theme: next }).eq('id', user.id)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={dark === true}
    >
      {dark ? (
        // Moon — shown in dark mode (the current mode)
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" strokeLinejoin="round" />
        </svg>
      ) : (
        // Sun — shown in light mode (the current mode)
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
