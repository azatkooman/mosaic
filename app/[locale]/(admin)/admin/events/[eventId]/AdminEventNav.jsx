'use client'

import { Link, usePathname } from '@/lib/i18n/navigation'
import styles from '../../../../(console)/console/console.module.css'

/**
 * Sub-tabs for the admin's read-only event view. Mirrors the Events Hub's
 * EventNav so the two read the same, but points at /admin routes — and offers
 * no editing entry points.
 */
export function AdminEventNav({ eventId, labels, ariaLabel }) {
  const pathname = usePathname()
  const base = `/admin/events/${eventId}`
  const items = [
    { href: base, label: labels.overview, exact: true },
    { href: `${base}/event-page`, label: labels.eventPage },
    { href: `${base}/settings`, label: labels.settings },
    { href: `${base}/forms`, label: labels.forms },
    { href: `${base}/participants`, label: labels.participants },
    { href: `${base}/team`, label: labels.team },
  ]

  return (
    <nav className={styles.eventNav} aria-label={ariaLabel}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-active={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
