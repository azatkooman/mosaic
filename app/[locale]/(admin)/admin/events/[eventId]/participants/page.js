import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDate } from '@/lib/dates'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { formatStructuredAnswer } from '@/lib/form-engine/format'
import { AdminParticipantsTable } from './AdminParticipantsTable'

export const dynamic = 'force-dynamic'

/**
 * Every registration on the event — including the archived ones, which is the
 * whole reason this section exists.
 *
 * Purpose-built rather than reusing the console's ParticipantsTable: that one
 * filters `deleted_at is null` through the shared query helper (by design, so
 * the Hub list and the export agree), which would hide exactly what an admin
 * comes here to see.
 *
 * Rows are shaped here and sorted in the browser. Every row is already loaded
 * — this list does not page — so sorting needs no round trip, and keeping the
 * shaping server-side keeps locale resolution and answer formatting off the
 * client.
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
  const raw = participants ?? []

  if (raw.length === 0) {
    return <p className="alert alert-info">{t('console.adminNothingHere')}</p>
  }

  // Answers keyed by question, using the version this participant actually
  // answered — not the form's current version, which may ask something else.
  function answerRows(p) {
    const questions = p.form_versions?.definition?.questions ?? []
    return questions
      .filter((q) => q.type !== 'section' && p.answers?.[q.id] != null)
      .map((q) => {
        const value = p.answers[q.id]
        return {
          id: q.id,
          label: lt(q.label, locale, dl) || q.id,
          // formatStructuredAnswer takes (question, value) — it renders the
          // composite name/address/phone shapes that would otherwise
          // stringify to "[object Object]".
          value:
            typeof value === 'object'
              ? formatStructuredAnswer(q, value) || JSON.stringify(value)
              : String(value),
        }
      })
  }

  const rows = raw.map((p) => ({
    id: p.id,
    // Sorting needs the two integers, not the "7.10" label, or 7.9 would sort
    // after 7.10 (see formatRegNo in lib/participants-query).
    regNo: p.reg_seq == null ? 0 : p.reg_seq * 1000 + (p.member_index ?? 1),
    regSeq: p.reg_seq,
    memberIndex: p.member_index ?? 1,
    name: [p.first_name, p.last_name].filter(Boolean).join(' '),
    email: p.email,
    typeName: lt(p.participant_types?.name, locale, dl),
    status: p.status,
    statusLabel: t(`status.${p.status}`),
    archived: Boolean(p.deleted_at),
    profileName: p.profile_name,
    profileEmail: p.profile_email,
    createdAt: Date.parse(p.created_at) || 0,
    createdAtLabel: formatEventDate(p.created_at, tz, locale, dateFmt),
    answers: answerRows(p),
  }))

  const archivedCount = rows.filter((r) => r.archived).length

  return (
    <>
      <p style={{ color: 'var(--ink-soft)', marginBlockEnd: 'var(--s-3)' }}>
        {t('console.adminParticipantsSummary', {
          total: rows.length,
          archived: archivedCount,
        })}
      </p>

      <AdminParticipantsTable
        rows={rows}
        // On an archived event every row may be purged; on a live one only a
        // cancelled registration may. purge_participants re-checks.
        eventArchived={Boolean(event?.deleted_at)}
        labels={{
          regNo: t('console.regNo'),
          name: t('console.adminParticipant'),
          type: t('console.byType'),
          status: t('console.byStatus'),
          archived: t('console.adminArchivedRow'),
          profileName: t('console.profileName'),
          profileEmail: t('console.profileEmail'),
          registeredAt: t('console.adminRegisteredAt'),
          answers: t('console.adminAnswers'),
          // Placeholders are substituted client-side, where the counts live.
          nSelected: t('console.adminNSelected', { count: '{count}' }),
          purgeTitle: t('console.adminPurgeTitle', { count: '{count}' }),
          andNMore: t('console.andNMore', { count: '{count}' }),
          selectAll: t('console.adminSelectAll'),
          select: t('console.adminSelect'),
          deselectAll: t('console.adminDeselectAll'),
          deletePermanently: t('console.adminDeletePermanently'),
          purgeWarning: t('console.adminPurgeWarning'),
          purgeNeedsCancelled: t('console.adminPurgeNeedsCancelled'),
          purgeError: t('console.adminPurgeError'),
          deleting: t('console.deleting'),
          cancel: t('common.cancel'),
        }}
      />
    </>
  )
}
