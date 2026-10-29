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
  // Compared by content, not identity: the parent passes a new object on every
  // render, and adopting it each time would undo a live change announced above.
  const [synced, setSynced] = useState(value)
  if (value.dateFormat !== synced.dateFormat || value.timeFormat !== synced.timeFormat) {
    setSynced(value)
    setPrefs(value)
  }

  return <DateFormatContext.Provider value={prefs}>{children}</DateFormatContext.Provider>
}

export function useDateFormatPrefs() {
  return useContext(DateFormatContext)
}
