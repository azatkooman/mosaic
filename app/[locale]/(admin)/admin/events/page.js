import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { eventPhase, EVENT_PHASE_TONES } from '@/lib/event-phase'
import { Badge, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import styles from '../admin-shell.module.css'

export const dynamic = 'force-dynamic'

/**
 * Admin ▸ Archived Events.
 *
 * The one place an admin can see events and registrations that are hidden
 * everywhere else. Two tabs, because archived registrations live on events
 * that are themselves still live:
 *
 *   Archived events      — soft-deleted (`deleted_at`), invisible to everyone
 *                          but admins (migration 0018).
 *   Non-archived events  — everything the Events Hub shows, minus drafts.
 *
 * Read-only by design: editing an event belongs in the Events Hub. The only
 * writes this section will ever offer are permanent deletion (a later step).
 *
 * Admins reach archived rows at all because RLS carves them out explicitly —
 * `events_select_public` allows `deleted_at is null OR private.is_admin()`, and
 * `participants_select` does the same. Nothing here elevates privileges; the
 * layout's admin gate is a UX check and RLS is the real boundary.
 */
export default async function AdminEventsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

  const supabase = await getSupabaseServerClient()

  const [{ data: events }, { data: liveCounts }, { data: archivedRows }] = await Promise.all([
    supabase
      .from('events')
      .select(
        'id, slug, status, name, default_locale, timezone, starts_at, ends_at, ' +
          'registration_opens_at, registration_closes_at, registration_manually_closed, deleted_at, first_published_at'
      )
      .order('starts_at', { ascending: false }),
    // Live participants only — the view filters archived rows (migration 0033).
    supabase.from('event_participant_counts').select('event_id, status, n'),
    // Archived participants, counted separately so an admin can see at a glance
    // which events actually have something to review. Only archived rows come
    // back, which is a small set; a full participant scan would not scale.
    supabase.from('participants').select('event_id').not('deleted_at', 'is', null),
  ])

  const liveTotals = new Map()
  for (const row of liveCounts ?? []) {
    if (row.status === 'confirmed' || row.status === 'waitlisted') {
      liveTotals.set(row.event_id, (liveTotals.get(row.event_id) ?? 0) + row.n)
    }
  }
  const archivedTotals = new Map()
  for (const row of archivedRows ?? []) {
    archivedTotals.set(row.event_id, (archivedTotals.get(row.event_id) ?? 0) + 1)
  }

  const all = events ?? []
  // Drafts are excluded deliberately: this section is about what has been out
  // in the world, and an unpublished draft never was.
  const archived = all.filter((e) => e.deleted_at)
  const nonArchived = all.filter((e) => !e.deleted_at && e.status !== 'draft')

  // Plain functions, not components: they only close over the request-scoped
  // formatters above, and calling them keeps the markup obviously one render.
  function eventRows(rows, showArchivedDate) {
    return rows.map((event) => (
      <tr key={event.id}>
        <td data-cell="title">
          {/* Into the read-only detail, never the Events Hub — this section
              must not become a back door to the editors. */}
          <Link href={`/admin/events/${event.id}`}>
            <strong>{lt(event.name, locale, event.default_locale)}</strong>
          </Link>
        </td>
        <td data-label={t('console.startsAt')}>
          {formatEventDateRange(
            event.starts_at,
            event.ends_at,
            event.timezone,
            locale,
            dateFmt
          )}
        </td>
        {showArchivedDate && (
          <td data-label={t('console.archivedAt')}>
            {formatEventDate(event.deleted_at, event.timezone, locale, dateFmt)}
          </td>
        )}
        <td data-label={t('console.participants')}>{liveTotals.get(event.id) ?? 0}</td>
        <td data-label={t('console.archivedParticipants')}>
          {archivedTotals.get(event.id) ?? 0}
        </td>
        <td data-label={t('console.status')}>
          <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Badge tone={event.status}>{t(`status.${event.status}`)}</Badge>
            {/* Phase is derived from the dates, so it stays meaningful for an
                archived event too — it says what the event was when it went. */}
            <Badge tone={EVENT_PHASE_TONES[eventPhase(event)]}>
              {t(`eventPhase.${eventPhase(event)}`)}
            </Badge>
          </span>
        </td>
      </tr>
    ))
  }

  function eventTable(rows, showArchivedDate, emptyMessage) {
    if (rows.length === 0) {
      return <p className="alert alert-info">{emptyMessage}</p>
    }
    return (
      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th>{t('console.eventName')}</th>
              <th>{t('console.startsAt')}</th>
              {showArchivedDate && <th>{t('console.archivedAt')}</th>}
              <th>{t('console.participants')}</th>
              <th>{t('console.archivedParticipants')}</th>
              <th>{t('console.status')}</th>
            </tr>
          </thead>
          <tbody>{eventRows(rows, showArchivedDate)}</tbody>
        </table>
      </div>
    )
  }

  return (
    // pageWide, not page: six columns of dates and counts are cramped at the
    // 56rem reading width the other admin screens use.
    <div className={styles.pageWide}>
      <div className={styles.pageHead}>
        <h1 className="page-title">{t('console.adminArchivedEvents')}</h1>
      </div>
      <p style={{ color: 'var(--ink-soft)' }}>{t('console.adminArchivedEventsIntro')}</p>

      <Tabs defaultValue="archived">
        <TabsList aria-label={t('console.adminArchivedEvents')}>
          <TabsTrigger value="archived">
            {t('console.tabArchivedEvents')} ({archived.length})
          </TabsTrigger>
          <TabsTrigger value="live">
            {t('console.tabNonArchivedEvents')} ({nonArchived.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="archived" style={{ paddingBlockStart: 'var(--s-4)' }}>
          {eventTable(archived, true, t('console.noArchivedEvents'))}
        </TabsContent>

        <TabsContent value="live" style={{ paddingBlockStart: 'var(--s-4)' }}>
          {eventTable(nonArchived, false, t('console.noNonArchivedEvents'))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
