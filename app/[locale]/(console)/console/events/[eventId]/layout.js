import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { Badge } from '@/components/ui'
import { EventNav } from './EventNav'
import styles from '../../console.module.css'

export const dynamic = 'force-dynamic'

export default async function EventLayout({ children, params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, name, status, default_locale')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) notFound()

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className="page-title">{lt(event.name, locale, event.default_locale)}</h1>
        <Badge tone={event.status}>{t(`status.${event.status}`)}</Badge>
      </div>
      <EventNav
        eventId={eventId}
        labels={{
          overview: t('console.overview'),
          eventPage: t('console.eventPage'),
          settings: t('console.settings'),
          forms: t('console.forms'),
          participants: t('console.participants'),
          team: t('console.team'),
        }}
      />
      {children}
    </>
  )
}
