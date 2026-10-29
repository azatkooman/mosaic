'use client'

import { createPortal } from 'react-dom'
import { useIsClient } from '@/lib/use-is-client'

/**
 * Renders children at the end of <body>, outside the tree that opened them.
 *
 * Fixed-position overlays must not stay where their trigger lives: any
 * ancestor with a `transform` becomes the containing block for
 * `position: fixed` descendants, so a card that lifts on hover both shrinks
 * the overlay to the card's box and lets `overflow: hidden` clip it. It also
 * breaks hover hit-testing — the clipped overlay stops covering the cursor,
 * `:hover` drops, the transform goes away, the overlay covers the cursor
 * again, and the pair strobe at the transition's frame rate. Escaping to
 * <body> makes an overlay immune to whatever styling surrounds its trigger.
 *
 * Renders nothing on the server and during hydration, because <body> does not
 * exist during SSR.
 */
export function Portal({ children }) {
  const isClient = useIsClient()
  if (!isClient) return null
  return createPortal(children, document.body)
}
