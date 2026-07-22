'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { eventPhase, EVENT_PHASE_TONES } from '@/lib/event-phase'
import { Badge, Input } from '@/components/ui'
import styles from './home.module.css'

export function HomeEventsList({ events, dateFmt }) {
  const t = useTranslations('home')
  const tRoot = useTranslations()
  const locale = useLocale()
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const visible = q
    ? events.filter((event) =>
        [event.name, event.description, event.location].some((field) =>
          (lt(field, locale, event.default_locale) ?? '')
            .toLowerCase()
            .includes(q)
        )
      )
    : events

  return (
    <>
      <div className={styles.searchRow}>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchEvents')}
          aria-label={t('searchEvents')}
        />
      </div>
      {visible.length === 0 ? (
        <p style={{ marginTop: 'var(--s-4)', color: 'var(--ink-soft)' }}>
          {events.length === 0 ? t('noEvents') : t('noSearchResults')}
        </p>
      ) : (
        <ul className={styles.grid}>
          {visible.map((event) => {
            const phase = eventPhase(event)
            return (
            <li key={event.id}>
              <Link href={`/events/${event.slug}`} className={styles.cardLink}>
                <article className="card">
                  <div className={styles.cardBody}>
                    <h3>{lt(event.name, locale, event.default_locale)}</h3>
                    <p style={{ marginBlock: '0.2rem 0.4rem' }}>
                      <Badge tone={EVENT_PHASE_TONES[phase]}>{tRoot(`eventPhase.${phase}`)}</Badge>
                    </p>
                    <p className={styles.cardMeta}>
                      {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale, dateFmt)}
                    </p>
                    {lt(event.location, locale, event.default_locale) && (
                      <p className={styles.cardMeta}>
                        {lt(event.location, locale, event.default_locale)}
                      </p>
                    )}
                  </div>
                </article>
              </Link>
            </li>
          )})}
        </ul>
      )}
    </>
  )
}
