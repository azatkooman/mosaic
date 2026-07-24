'use client'

import { useEffect, useState } from 'react'
import { applyThemeClient } from '@/lib/theme'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/** Header light/dark toggle. Reads the theme that's actually applied (the
 *  data-theme attribute the server set, or the system preference), flips it,
 *  and persists via applyThemeClient (cookie + attribute → no flash on the
 *  next server render). When signed in it also saves to the profile so the
 *  Profile → Appearance setting stays in sync with this toggle. */
export function ThemeToggle({ label }) {
  const [dark, setDark] = useState(null)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    const attr = document.documentElement.dataset.theme
    const isDark =
      attr === 'dark' ||
      (!attr && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setDark(isDark)
  }, [])

  async function toggle() {
    const next = dark ? 'light' : 'dark'
    applyThemeClient(next)
    setDark(!dark)
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
        // Sun — shown in dark mode (click to go light)
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" strokeLinecap="round" />
        </svg>
      ) : (
        // Moon — shown in light mode (click to go dark)
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
