import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import consoleStyles from '../../../../(console)/console/console.module.css'

export const dynamic = 'force-dynamic'

/**
 * Read-only overview. Mirrors the Events Hub's stat tiles, plus one the Hub
 * has no reason to show: how many registrations are archived — the thing this
 * whole section exists to review.
 */
export default async function AdminEventOverview({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const [{ data: counts }, { data: types }, { data: archivedRows }] = await Promise.all([
    // Live participants only (the view filters archived rows).
    supabase.from('event_participant_counts').select('*').eq('event_id', eventId),
    supabase
      .from('participant_types')
      .select('id, key, name, capacity, sort_order')
      .eq('event_id', eventId)
      .order('sort_order'),
    supabase
      .from('participants')
      .select('id')
      .eq('event_id', eventId)
      .not('deleted_at', 'is', null),
  ])

  const byStatus = {}
  const byType = new Map()
  for (const row of counts ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.n
    if (row.status === 'confirmed') {
      byType.set(row.participant_type_id, (byType.get(row.participant_type_id) ?? 0) + row.n)
    }
  }
  const total = (byStatus.confirmed ?? 0) + (byStatus.waitlisted ?? 0)

  const tiles = [
    { key: 'total', label: t('console.totalRegistered'), value: total },
    { key: 'confirmed', label: t('status.confirmed'), value: byStatus.confirmed ?? 0 },
    { key: 'waitlisted', label: t('status.waitlisted'), value: byStatus.waitlisted ?? 0 },
    { key: 'cancelled', label: t('status.cancelled'), value: byStatus.cancelled ?? 0 },
    {
      key: 'archived',
      label: t('console.archivedParticipants'),
      value: (archivedRows ?? []).length,
    },
  ]

  return (
    <>
      <div className={consoleStyles.statGrid}>
        {tiles.map((tile) => (
          <div key={tile.key} className={`card ${consoleStyles.stat}`}>
            <div className={consoleStyles.statValue}>{tile.value}</div>
            <div className={consoleStyles.statLabel}>{tile.label}</div>
          </div>
        ))}
      </div>

      <h2 className="eyebrow" style={{ marginBlock: 'var(--s-5) var(--s-3)' }}>
        {t('console.byType')}
      </h2>
      {(types ?? []).length === 0 ? (
        <p className="alert alert-info">{t('console.adminNothingHere')}</p>
      ) : (
        <div className="table-wrap" style={{ maxInlineSize: '36rem' }}>
          <table className="table">
            <tbody>
              {(types ?? []).map((pt) => (
                <tr key={pt.id}>
                  <td>{lt(pt.name, locale)}</td>
                  <td
                    style={{
                      textAlign: 'end',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {byType.get(pt.id) ?? 0}
                    {pt.capacity != null && ` / ${pt.capacity}`}
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
