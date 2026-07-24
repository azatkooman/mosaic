'use client'

import { createContext, useContext, useEffect, useState } from 'react'

// Server-read cookie prefs, made available to client components (server
// components read the cookie directly via lib/date-format-server).
const DateFormatContext = createContext({ dateFormat: 'auto', timeFormat: 'auto' })

export function DateFormatProvider({ value, children }) {
  const [prefs, setPrefs] = useState(value)

  // Live-update when the preference changes elsewhere in the same session
  // (e.g. the profile form) WITHOUT a full reload. This provider lives in the
  // root layout, which is not re-rendered on client-side navigation, so the
  // cookie-derived prop alone would stay stale until a hard refresh.
  useEffect(() => {
    function onChange(e) {
      if (!e?.detail) return
      setPrefs({
        dateFormat: e.detail.dateFormat ?? 'auto',
        timeFormat: e.detail.timeFormat ?? 'auto',
      })
    }
    window.addEventListener('mosaic:datefmt', onChange)
    return () => window.removeEventListener('mosaic:datefmt', onChange)
  }, [])

  // Re-sync when a fresh server render supplies new cookie-derived values.
  useEffect(() => {
    setPrefs(value)
  }, [value.dateFormat, value.timeFormat])

  return <DateFormatContext.Provider value={prefs}>{children}</DateFormatContext.Provider>
}

export function useDateFormatPrefs() {
  return useContext(DateFormatContext)
}
