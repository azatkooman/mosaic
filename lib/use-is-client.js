'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False during the server render and the hydration pass that must match it,
 * true on every client render after that.
 *
 * The usual `useState(false)` + `useEffect(() => setMounted(true))` does the
 * same thing with an extra cascading render per component; this asks React
 * directly, through the server snapshot it already keeps for hydration.
 */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
