import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { MosaicMark } from '@/components/ui'
import { HomeEventsList } from './HomeEventsList'
import styles from './home.module.css'

export const revalidate = 300

export default async function HomePage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

  const supabase = getSupabaseAnonClient()
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, name, description, location, timezone, starts_at, ends_at, cover_image_path, default_locale, registration_opens_at, registration_closes_at')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroMark} aria-hidden="true">
            <MosaicMark />
          </div>
          <h1 className={styles.heroTitle}>{t('home.heroTitle')}</h1>
          <p className={styles.heroSubtitle}>{t('home.heroSubtitle')}</p>
        </div>
      </section>

      <section className="container" style={{ paddingBlock: 'var(--s-6)' }}>
        <h2 className="eyebrow">{t('home.upcomingEvents')}</h2>
        <HomeEventsList events={events ?? []} dateFmt={dateFmt} />
      </section>
    </>
  )
}
