'use client'

import { useEffect, useId, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './shell.module.css'

/** Hamburger menu for small screens. Shows the nav links + actions that are
 *  hidden from the top bar on mobile, so phones can reach everything the
 *  desktop header exposes. */
export function MobileNav({ label, children }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const pathname = usePathname()

  // Escape closes, and the page behind the backdrop must not scroll — on iOS
  // the panel otherwise appears to float away from the header as the body
  // rubber-bands underneath it.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // A click on a link inside the panel closes it, but navigation can also
  // happen without one (back button, a redirect). Close on any route change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className={styles.mobileNav}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          ) : (
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <div className={styles.mobileBackdrop} onClick={() => setOpen(false)}>
          <nav
            id={panelId}
            className={styles.mobileMenu}
            aria-label={label}
            onClick={(e) => {
              // Keep the panel open for interactive controls inside it — the
              // language <select> in particular, whose click would otherwise
              // unmount the menu before its options could be picked. Only a
              // navigation link should dismiss the panel.
              e.stopPropagation()
              if (e.target.closest('a')) setOpen(false)
            }}
          >
            {children}
          </nav>
        </div>
      )}
    </div>
  )
}
