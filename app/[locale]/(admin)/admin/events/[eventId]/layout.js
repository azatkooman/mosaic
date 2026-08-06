import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { eventPhase, EVENT_PHASE_TONES } from '@/lib/event-phase'
import { Badge } from '@/components/ui'
import { AdminEventNav } from './AdminEventNav'
import styles from '../../admin-shell.module.css'

export const dynamic = 'force-dynamic'

/**
 * Read-only shell for one event in Admin ▸ Archived Events.
 *
 * Deliberately a separate route tree from the Events Hub rather than a flag on
 * it: every page under here renders values, never inputs, so there is no
 * editing surface to accidentally leave enabled. Archived events resolve here
 * at all because `events_select_public` exempts admins from the `deleted_at`
 * filter — the same read the list page relies on.
 */
export default async function AdminEventLayout({ children, params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, name, status, default_locale, starts_at, ends_at, registration_opens_at, registration_closes_at, deleted_at')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) notFound()

  return (
    <div className={styles.pageWide}>
      <Link href="/admin/events" className="btn btn-ghost btn-sm" style={{ alignSelf: 'start' }}>
        <span aria-hidden="true">&larr;</span> {t('console.adminArchivedEvents')}
      </Link>

      <div className={styles.pageHead}>
        <h1 className="page-title">{lt(event.name, locale, event.default_locale)}</h1>
        <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <Badge tone={event.status}>{t(`status.${event.status}`)}</Badge>
          <Badge tone={EVENT_PHASE_TONES[eventPhase(event)]}>
            {t(`eventPhase.${eventPhase(event)}`)}
          </Badge>
          {event.deleted_at && (
            <Badge tone="cancelled">{t('console.archivedAt')}</Badge>
          )}
        </span>
      </div>

      <p className="alert alert-info" style={{ marginBlockEnd: 0 }}>
        {t('console.adminViewOnly')}
      </p>

      <AdminEventNav
        eventId={eventId}
        ariaLabel={t('console.ariaEventNav')}
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
    </div>
  )
}
