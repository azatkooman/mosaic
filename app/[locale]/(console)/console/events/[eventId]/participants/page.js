import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { eventQuestionBuckets } from '@/lib/event-questions'
import { ParticipantsTable } from './ParticipantsTable'

export const dynamic = 'force-dynamic'

export default async function ParticipantsPage({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const [{ data: types }, { data: versions }, { data: canEdit }, { data: canChangeStatus }] = await Promise.all([
    supabase
      .from('participant_types')
      .select('id, key, name')
      .eq('event_id', eventId)
      .order('sort_order'),
    // All form versions ever used by this event's participants → union of
    // questions. FK hint required: forms↔form_versions has two relationships.
    supabase
      .from('form_versions')
      .select(
        'id, definition, forms!form_versions_form_id_fkey!inner ( event_id, current_version_id, registration_mode )'
      )
      .eq('forms.event_id', eventId),
    // UX gate for the Edit button (update_participant re-checks authoritatively).
    supabase.rpc('can_add_registrants_api', { eid: eventId }),
    // Status changes are restricted to roles with the check-in privilege.
    supabase.rpc('can_checkin_event_api', { eid: eventId }),
  ])

  // Every version is still needed by the detail drawer, which renders each
  // participant against the exact version they answered. The COLUMNS, though,
  // come only from what the event's forms ask today — see eventQuestionColumns.
  const definitionByVersion = {}
  for (const v of versions ?? []) {
    definitionByVersion[v.id] = v.definition ?? { questions: [] }
  }
  // Individual and group registrations are listed separately, each with the
  // columns of its own forms, so the two tables share no answer column.
  const buckets = eventQuestionBuckets(versions ?? [])

  return (
    <ParticipantsTable
      eventId={eventId}
      participantTypes={types ?? []}
      buckets={buckets}
      definitionByVersion={definitionByVersion}
      canEdit={Boolean(canEdit)}
      canChangeStatus={Boolean(canChangeStatus)}
    />
  )
}
