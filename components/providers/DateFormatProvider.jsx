'use client'

import { createContext, useContext } from 'react'

// Server-read cookie prefs, made available to client components (server
// components read the cookie directly via lib/date-format-server).
const DateFormatContext = createContext({ dateFormat: 'auto', timeFormat: 'auto' })

export function DateFormatProvider({ value, children }) {
  return <DateFormatContext.Provider value={value}>{children}</DateFormatContext.Provider>
}

export function useDateFormatPrefs() {
  return useContext(DateFormatContext)
}
