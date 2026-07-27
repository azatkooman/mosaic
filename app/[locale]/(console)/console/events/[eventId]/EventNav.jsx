'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/lib/i18n/navigation'
import styles from '../../console.module.css'

export function EventNav({ eventId, labels }) {
  const t = useTranslations('console')
  const pathname = usePathname()
  const base = `/console/events/${eventId}`
  const items = [
    { href: base, label: labels.overview, exact: true },
    { href: `${base}/event-page`, label: labels.eventPage },
    { href: `${base}/settings`, label: labels.settings },
    { href: `${base}/forms`, label: labels.forms },
    { href: `${base}/participants`, label: labels.participants },
    { href: `${base}/team`, label: labels.team },
  ]

  return (
    <nav className={styles.eventNav} aria-label={t('ariaEventNav')}>
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
