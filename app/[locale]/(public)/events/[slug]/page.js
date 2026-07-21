import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
import { eventPhase, EVENT_PHASE_TONES } from '@/lib/event-phase'
import { Badge } from '@/components/ui'
import { getDateFormatPrefs } from '@/lib/date-format-server'
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
  const tPhase = await getTranslations('eventPhase')
  const dateFmt = await getDateFormatPrefs()

  const event = await getEvent(slug)
  if (!event) notFound()

  const phase = eventPhase(event)
  const notOpenYet = phase === 'registrationNotOpen'
  // In-progress events keep the register CTA (walk-ins are allowed unless a
  // close date passed — mirrors the server-side registration-window check).
  const closed = phase === 'registrationClosed' || phase === 'ended'

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
        <p style={{ marginBlock: '0.3rem var(--s-4)' }}>
          <Badge tone={EVENT_PHASE_TONES[phase]}>{tPhase(phase)}</Badge>
        </p>

        <dl className={styles.meta}>
          <div>
            <dt>{t('when')}</dt>
            <dd>
              {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale, dateFmt)}
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
                    <a href={`tel:${event.contact.phone}`}>{event.contact.phone}</a>
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
                date: formatEventDate(event.registration_opens_at, event.timezone, locale, dateFmt),
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
