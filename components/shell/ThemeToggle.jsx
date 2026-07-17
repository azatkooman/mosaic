'use client'

import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon } from '@/components/ui'

const STORAGE_KEY = 'mosaic-theme'

/** Light/dark toggle. Follows the system preference until the user picks a
 *  theme, then persists the choice (applied before paint by the inline
 *  script in the root layout). */
export function ThemeToggle({ label }) {
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    setTheme(stored === 'dark' || stored === 'light' ? stored : system)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // private browsing — theme still applies for this page view
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
