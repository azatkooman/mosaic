import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDate } from '@/lib/dates'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { formatRegNo } from '@/lib/participants-query'
import { formatStructuredAnswer } from '@/lib/form-engine/format'
import { Badge } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Every registration on the event — including the archived ones, which is the
 * whole reason this section exists.
 *
 * Purpose-built rather than reusing the console's ParticipantsTable: that one
 * filters `deleted_at is null` through the shared query helper (by design, so
 * the Hub list and the export agree), which would hide exactly what an admin
 * comes here to see. This one is also entirely server-rendered — no filtering,
 * sorting or paging, because it is a review surface, not a working list.
 *
 * Answers live in a <details> per row so a wide form does not force a
 * horizontal scroll, and so no client JavaScript is needed to expand them.
 */
export default async function AdminEventParticipants({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

  const supabase = await getSupabaseServerClient()
  const [{ data: participants }, { data: event }] = await Promise.all([
    supabase
      .from('participants')
      .select(
        'id, first_name, last_name, email, status, answers, created_at, deleted_at, ' +
          'reg_seq, member_index, profile_name, profile_email, ' +
          'participant_types ( name ), form_versions ( definition )'
      )
      .eq('event_id', eventId)
      .order('reg_seq', { ascending: true })
      .order('member_index', { ascending: true }),
    supabase.from('events').select('default_locale, timezone').eq('id', eventId).maybeSingle(),
  ])

  const dl = event?.default_locale
  const tz = event?.timezone ?? 'UTC'
  const rows = participants ?? []
  const archivedCount = rows.filter((p) => p.deleted_at).length

  if (rows.length === 0) {
    return <p className="alert alert-info">{t('console.adminNothingHere')}</p>
  }

  // Answers keyed by question, using the version this participant actually
  // answered — not the form's current version, which may ask something else.
  function answerRows(p) {
    const questions = p.form_versions?.definition?.questions ?? []
    return questions
      .filter((q) => q.type !== 'section' && p.answers?.[q.id] != null)
      .map((q) => {
        const raw = p.answers[q.id]
        // formatStructuredAnswer takes (question, value) — it renders the
        // composite name/address/phone shapes that would otherwise stringify
        // to "[object Object]".
        const value =
          typeof raw === 'object'
            ? formatStructuredAnswer(q, raw) || JSON.stringify(raw)
            : String(raw)
        return { id: q.id, label: lt(q.label, locale, dl) || q.id, value }
      })
  }

  return (
    <>
      <p style={{ color: 'var(--ink-soft)', marginBlockEnd: 'var(--s-3)' }}>
        {t('console.adminParticipantsSummary', {
          total: rows.length,
          archived: archivedCount,
        })}
      </p>

      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th>{t('console.regNo')}</th>
              <th>{t('common.actions')}</th>
              <th>{t('console.byType')}</th>
              <th>{t('console.byStatus')}</th>
              <th>{t('console.profileName')}</th>
              <th>{t('console.profileEmail')}</th>
              <th>{t('console.adminRegisteredAt')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const answers = answerRows(p)
              return (
                <tr key={p.id} data-archived={p.deleted_at ? '' : undefined}>
                  <td data-cell="title">{formatRegNo(p) || '—'}</td>
                  <td data-label={t('common.actions')}>
                    <div>
                      {[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}
                      {p.email && (
                        <div style={{ color: 'var(--ink-soft)' }}>{p.email}</div>
                      )}
                    </div>
                    {answers.length > 0 && (
                      <details style={{ marginBlockStart: 'var(--s-1)' }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--ink-soft)' }}>
                          {t('console.adminAnswers')} ({answers.length})
                        </summary>
                        <dl style={{ margin: 'var(--s-2) 0 0' }}>
                          {answers.map((a) => (
                            <div key={a.id} style={{ marginBlockEnd: 'var(--s-1)' }}>
                              <dt style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>
                                {a.label}
                              </dt>
                              <dd style={{ margin: 0, overflowWrap: 'break-word' }}>{a.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </td>
                  <td data-label={t('console.byType')}>
                    {lt(p.participant_types?.name, locale, dl) || '—'}
                  </td>
                  <td data-label={t('console.byStatus')}>
                    <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Badge tone={p.status}>{t(`status.${p.status}`)}</Badge>
                      {/* The distinction this page exists for: archived rows
                          are invisible to the organizer and the registrant. */}
                      {p.deleted_at && (
                        <Badge tone="archived">{t('console.adminArchivedRow')}</Badge>
                      )}
                    </span>
                  </td>
                  <td data-label={t('console.profileName')}>{p.profile_name || '—'}</td>
                  <td data-label={t('console.profileEmail')}>{p.profile_email || '—'}</td>
                  <td data-label={t('console.adminRegisteredAt')}>
                    {formatEventDate(p.created_at, tz, locale, dateFmt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
