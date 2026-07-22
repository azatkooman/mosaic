import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { eventPhase, EVENT_PHASE_TONES } from '@/lib/event-phase'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { Badge } from '@/components/ui'
import { NewEventButton } from './NewEventButton'
import { DeleteEventButton } from './DeleteEventButton'
import styles from './console.module.css'

export const dynamic = 'force-dynamic'

export default async function ConsoleHome({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // The console layout redirects to login; render nothing meanwhile.
    return null
  }

  const [{ data: myRoles }, { data: memberships }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('event_organizers').select('event_id, status').eq('user_id', user.id),
  ])
  // Admins and global organizers see and manage every event.
  const seesAllEvents = (myRoles?.length ?? 0) > 0
  // Deleting is tighter than seeing: admins, or the event's own creator.
  const isAdmin = (myRoles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin')
  const activeIds = (memberships ?? [])
    .filter((m) => m.status === 'active')
    .map((m) => m.event_id)


  // "My events": events the user has an active role on; admins and global
  // organizers see all. (RLS also exposes published events to everyone,
  // hence the explicit filter.)
  let events = []
  if (seesAllEvents || activeIds.length > 0) {
    let query = supabase
      .from('events')
      .select('id, slug, status, name, default_locale, timezone, starts_at, ends_at, registration_opens_at, registration_closes_at, created_by, first_published_at')
      .is('deleted_at', null)
      .order('starts_at', { ascending: false })
    if (!seesAllEvents) query = query.in('id', activeIds)
    events = (await query).data ?? []
  }

  const { data: counts } = await supabase
    .from('event_participant_counts')
    .select('event_id, status, n')
  const totals = new Map()
  for (const row of counts ?? []) {
    if (row.status === 'confirmed' || row.status === 'waitlisted') {
      totals.set(row.event_id, (totals.get(row.event_id) ?? 0) + row.n)
    }
  }

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className="page-title">{t('console.events')}</h1>
        <NewEventButton label={t('console.newEvent')} />
      </div>

      {events.length === 0 ? (
        <p className="alert alert-info">{t('console.noMyEvents')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('console.eventName')}</th>
                <th>{t('console.startsAt')}</th>
                <th>{t('console.participants')}</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Link href={`/console/events/${event.id}`}>
                      <strong>{lt(event.name, locale, event.default_locale)}</strong>
                    </Link>
                  </td>
                  <td>
                    {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale, dateFmt)}
                  </td>
                  <td>{totals.get(event.id) ?? 0}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Badge tone={event.status}>{t(`status.${event.status}`)}</Badge>
                      {event.status === 'published' && (
                        <Badge tone={EVENT_PHASE_TONES[eventPhase(event)]}>
                          {t(`eventPhase.${eventPhase(event)}`)}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td style={{ textAlign: 'end' }}>
                    {(isAdmin || event.created_by === user.id) && (
                      <DeleteEventButton
                        eventId={event.id}
                        eventName={lt(event.name, locale, event.default_locale)}
                        everPublished={Boolean(event.first_published_at)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
