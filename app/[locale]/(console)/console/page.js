import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { Badge } from '@/components/ui'
import { NewEventButton } from './NewEventButton'
import { JoinEvents } from './JoinEvents'
import { RequestOrganizerRole } from './RequestOrganizerRole'
import styles from './console.module.css'

export const dynamic = 'force-dynamic'

export default async function ConsoleHome({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // The console layout redirects to login; render nothing meanwhile.
    return null
  }

  const [{ data: myRoles }, { data: memberships }, { data: roleRequest }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('event_organizers').select('event_id, status').eq('user_id', user.id),
    supabase.from('role_requests').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  // Admins and global organizers see and manage every event.
  const seesAllEvents = (myRoles?.length ?? 0) > 0
  const activeIds = (memberships ?? [])
    .filter((m) => m.status === 'active')
    .map((m) => m.event_id)
  const requestedIds = (memberships ?? [])
    .filter((m) => m.status === 'requested')
    .map((m) => m.event_id)

  // "My events": events the user has an active role on; admins and global
  // organizers see all. (RLS also exposes published events to everyone,
  // hence the explicit filter.)
  let events = []
  if (seesAllEvents || activeIds.length > 0) {
    let query = supabase
      .from('events')
      .select('id, slug, status, name, default_locale, timezone, starts_at, ends_at')
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

  // Published events the user isn't on: offered for access requests.
  let joinable = []
  if (!seesAllEvents) {
    const { data: published } = await supabase
      .from('events')
      .select('id, name, default_locale, timezone, starts_at, ends_at')
      .eq('status', 'published')
      .order('starts_at', { ascending: true })
    joinable = (published ?? []).filter((e) => !activeIds.includes(e.id))
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
                    {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)}
                  </td>
                  <td>{totals.get(event.id) ?? 0}</td>
                  <td>
                    <Badge tone={event.status}>{t(`status.${event.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <JoinEvents
        events={joinable}
        requestedEventIds={requestedIds}
        allAccess={seesAllEvents}
      />

      {!seesAllEvents && (
        <RequestOrganizerRole userId={user.id} roleRequested={Boolean(roleRequest)} />
      )}
    </>
  )
}
