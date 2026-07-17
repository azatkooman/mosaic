import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
import {
  CalendarIcon,
  PinIcon,
  UserIcon,
  MailIcon,
  PhoneIcon,
  GlobeIcon,
} from '@/components/ui'
import styles from './event.module.css'

export const revalidate = 300

async function getEvent(slug) {
  const supabase = getSupabaseAnonClient()
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }) {
  const { slug, locale } = await params
  const event = await getEvent(slug)
  if (!event) return {}
  return {
    title: lt(event.name, locale, event.default_locale),
    description: lt(event.description, locale, event.default_locale)?.slice(0, 160),
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `/${l}/events/${slug}`])
      ),
    },
  }
}

export default async function EventPage({ params }) {
  const { slug, locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('event')

  const event = await getEvent(slug)
  if (!event) notFound()

  const now = Date.now()
  const opensAt = event.registration_opens_at ? Date.parse(event.registration_opens_at) : null
  const closesAt = event.registration_closes_at ? Date.parse(event.registration_closes_at) : null
  const notOpenYet = opensAt != null && now < opensAt
  const closed = closesAt != null && now > closesAt

  const coverUrl = event.cover_image_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-covers/${event.cover_image_path}`
    : null

  const name = lt(event.name, locale, event.default_locale)
  const location = lt(event.location, locale, event.default_locale)
  const description = lt(event.description, locale, event.default_locale)
  const dateRange = formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)
  const hasContact =
    event.contact?.name || event.contact?.email || event.contact?.phone || event.contact?.website

  return (
    <article>
      <header className={styles.hero}>
        {coverUrl && (
          <div className={styles.cover} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" />
          </div>
        )}
        <div className={`container ${styles.heroInner}`}>
          <h1 className={styles.heroTitle}>{name}</h1>
          <div className={styles.heroPills}>
            <span className={styles.pill}>
              <CalendarIcon />
              {dateRange}
            </span>
            {location && (
              <span className={styles.pill}>
                <PinIcon />
                {location}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className={`container ${styles.layout}`}>
        <div className={styles.main}>
          {description && (
            <>
              <h2 className="eyebrow">{t('about')}</h2>
              <p className={styles.description}>{description}</p>
            </>
          )}
        </div>

        <aside className={styles.sidebar}>
          <div className={`card ${styles.panel}`}>
            {closed ? (
              <p className="alert alert-info">{t('registrationClosed')}</p>
            ) : notOpenYet ? (
              <p className="alert alert-info">
                {t('registrationNotOpen', {
                  date: formatEventDate(event.registration_opens_at, event.timezone, locale),
                })}
              </p>
            ) : (
              <>
                <Link
                  href={`/events/${slug}/register`}
                  className={`btn btn-primary btn-lg ${styles.registerBtn}`}
                >
                  {t('register')}
                </Link>
                {event.registration_closes_at && (
                  <p className={styles.deadline}>
                    {t('registrationCloses', {
                      date: formatEventDate(event.registration_closes_at, event.timezone, locale),
                    })}
                  </p>
                )}
              </>
            )}

            <h2 className={styles.panelHead}>{t('eventDetails')}</h2>
            <ul className={styles.detailList}>
              <li>
                <span className={styles.detailIcon}>
                  <CalendarIcon />
                </span>
                <div>
                  <span className={styles.detailLabel}>{t('when')}</span>
                  {dateRange}
                </div>
              </li>
              {location && (
                <li>
                  <span className={styles.detailIcon}>
                    <PinIcon />
                  </span>
                  <div>
                    <span className={styles.detailLabel}>{t('where')}</span>
                    {location}
                  </div>
                </li>
              )}
              {hasContact && (
                <li>
                  <span className={styles.detailIcon}>
                    <UserIcon />
                  </span>
                  <div>
                    <span className={styles.detailLabel}>{t('contact')}</span>
                    {event.contact.name && <div>{event.contact.name}</div>}
                    {event.contact.email && (
                      <div className={styles.contactRow}>
                        <MailIcon />
                        <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
                      </div>
                    )}
                    {event.contact.phone && (
                      <div className={styles.contactRow}>
                        <PhoneIcon />
                        <a href={`tel:${event.contact.phone.replace(/[^+\d]/g, '')}`}>
                          {event.contact.phone}
                        </a>
                      </div>
                    )}
                    {event.contact.website && (
                      <div className={styles.contactRow}>
                        <GlobeIcon />
                        <a href={event.contact.website} target="_blank" rel="noreferrer">
                          {event.contact.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </article>
  )
}
