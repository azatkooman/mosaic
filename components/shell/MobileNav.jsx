'use client'

import { useState } from 'react'
import styles from './shell.module.css'

/** Hamburger menu for small screens. Shows the nav links + actions that are
 *  hidden from the top bar on mobile, so phones can reach everything the
 *  desktop header exposes. */
export function MobileNav({ label, children }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.mobileNav}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={label}
        aria-expanded={open}
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
