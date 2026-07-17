import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
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

  return (
    <article>
      {coverUrl && (
        <div className={styles.cover}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" />
        </div>
      )}
      <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
        <h1 className="page-title">{lt(event.name, locale, event.default_locale)}</h1>

        <dl className={styles.meta}>
          <div>
            <dt>{t('when')}</dt>
            <dd>
              {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)}
            </dd>
          </div>
          {lt(event.location, locale, event.default_locale) && (
            <div>
              <dt>{t('where')}</dt>
              <dd>{lt(event.location, locale, event.default_locale)}</dd>
            </div>
          )}
          {(event.contact?.name || event.contact?.email || event.contact?.phone || event.contact?.website) && (
            <div>
              <dt>{t('contact')}</dt>
              <dd>
                {event.contact.name && <div>{event.contact.name}</div>}
                {event.contact.email && (
                  <div>
                    <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
                  </div>
                )}
                {event.contact.phone && (
                  <div>
                    <a href={`tel:${event.contact.phone.replace(/[^+\d]/g, '')}`}>{event.contact.phone}</a>
                  </div>
                )}
                {event.contact.website && (
                  <div>
                    <a href={event.contact.website} target="_blank" rel="noreferrer">
                      {event.contact.website}
                    </a>
                  </div>
                )}
              </dd>
            </div>
          )}
        </dl>

        {lt(event.description, locale, event.default_locale) && (
          <p className={styles.description}>
            {lt(event.description, locale, event.default_locale)}
          </p>
        )}

        <div className={styles.cta}>
          {closed ? (
            <p className="alert alert-info">{t('registrationClosed')}</p>
          ) : notOpenYet ? (
            <p className="alert alert-info">
              {t('registrationNotOpen', {
                date: formatEventDate(event.registration_opens_at, event.timezone, locale),
              })}
            </p>
          ) : (
            <Link href={`/events/${slug}/register`} className="btn btn-primary btn-lg">
              {t('register')}
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
