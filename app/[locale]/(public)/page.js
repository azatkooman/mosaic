import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { MosaicMark } from '@/components/ui'
import styles from './home.module.css'

export const revalidate = 300

function dateChip(iso, timeZone, locale) {
  const d = new Date(iso)
  return {
    month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone }).format(d),
    day: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(d),
  }
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <path
        d="M8 1.5a4.7 4.7 0 0 1 4.7 4.7c0 3.4-4.7 8.3-4.7 8.3S3.3 9.6 3.3 6.2A4.7 4.7 0 0 1 8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="6.2" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export default async function HomePage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = getSupabaseAnonClient()
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, name, description, location, timezone, starts_at, ends_at, cover_image_path, default_locale')
    .eq('status', 'published')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  return (
    <>
      <section className={styles.hero}>
        <div aria-hidden="true" className={styles.heroTiles}>
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="container">
          <div className={styles.heroMark} aria-hidden="true">
            <MosaicMark />
          </div>
          <h1 className={styles.heroTitle}>{t('home.heroTitle')}</h1>
          <p className={styles.heroSubtitle}>{t('home.heroSubtitle')}</p>
          <div className={styles.heroActions}>
            <a href="#events" className="btn btn-primary">
              {t('home.browseEvents')}
            </a>
          </div>
        </div>
      </section>

      <section id="events" className={`container ${styles.events}`}>
        <div className={styles.sectionHead}>
          <h2 className="eyebrow">{t('home.upcomingEvents')}</h2>
          {events?.length > 0 && (
            <span className={styles.countBadge}>{events.length}</span>
          )}
        </div>
        {!events?.length ? (
          <div className={styles.empty}>
            <div aria-hidden="true" className={styles.emptyMark}>
              <MosaicMark />
            </div>
            <p>{t('home.noEvents')}</p>
          </div>
        ) : (
          <ul className={styles.grid}>
            {events.map((event, i) => {
              const chip = dateChip(event.starts_at, event.timezone, locale)
              const location = lt(event.location, locale, event.default_locale)
              return (
                <li key={event.id}>
                  <Link href={`/events/${event.slug}`} className={styles.cardLink}>
                    <article className={`card ${styles.eventCard}`} data-tone={i % 3}>
                      <div className={styles.cardBody}>
                        <div className={styles.cardTop}>
                          <div className={styles.dateChip}>
                            <span className={styles.dateMonth}>{chip.month}</span>
                            <span className={styles.dateDay}>{chip.day}</span>
                          </div>
                          <div>
                            <h3>{lt(event.name, locale, event.default_locale)}</h3>
                            <p className={styles.cardMeta}>
                              <CalendarIcon />
                              {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)}
                            </p>
                            {location && (
                              <p className={styles.cardMeta}>
                                <PinIcon />
                                {location}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className={styles.cardFoot}>
                        <span>{t('home.viewDetails')}</span>
                        <span aria-hidden="true" className={styles.cardArrow}>→</span>
                      </div>
                    </article>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
