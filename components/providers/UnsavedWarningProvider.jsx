'use client'

import { createContext, useContext } from 'react'

/**
 * Whether the console editors should warn before navigating away with unsaved
 * (or unpublished) work — `profiles.warn_unsaved_changes`.
 *
 * Read once in the console layout and shared by context rather than fetched by
 * each editor: three pages would otherwise each need their own profiles query
 * for one boolean. A layout cannot pass props to the page it wraps, so context
 * is the mechanism.
 *
 * No cookie mirror, unlike the date-format and theme preferences. Those are
 * read during the ROOT layout's render on every page of the site, where a
 * per-request profiles query would be real overhead — and they must apply to
 * signed-out visitors, who have no row to read. This one is needed only inside
 * a console that has already queried the user, and only for someone signed in.
 *
 * Defaults to true, which is also what a null reads as: no provider, no row, or
 * an unapplied migration 0048 all leave the warning on. The preference can only
 * ever take the guard away, never introduce it by surprise.
 */
const UnsavedWarningContext = createContext(true)

export function UnsavedWarningProvider({ value, children }) {
  return (
    <UnsavedWarningContext.Provider value={value !== false}>
      {children}
    </UnsavedWarningContext.Provider>
  )
}

export function useUnsavedWarningEnabled() {
  return useContext(UnsavedWarningContext)
}
