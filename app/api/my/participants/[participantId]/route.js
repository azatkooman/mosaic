import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { validateParticipantAnswers } from '@/lib/form-engine/validate'

/**
 * Self-service edit: the person who submitted a registration updates one of
 * its participants while the event's registration window is still open.
 *
 * Mirrors the organizer route (/api/participants/[participantId]) but writes
 * through update_own_participant, which re-checks ownership and the
 * registration window server-side. Answers are re-validated with the same
 * shared engine against the form version the participant answered.
 *
 * Body: { firstName, lastName, email, answers }
 */
export async function PATCH(request, { params }) {
  const { participantId } = await params
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const asString = (v) => (typeof v === 'string' ? v.trim() : '')

  // RLS lets registrants read their own participants; the answered form
  // version is a published version of the event's form, also readable.
  const { data: participant, error: loadError } = await supabase
    .from('participants')
    .select('id, participant_type_id, form_version_id, participant_types ( key ), form_versions ( definition ), registrations!inner ( registered_by )')
    .eq('id', participantId)
    .maybeSingle()
  if (loadError || !participant) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (participant.registrations?.registered_by !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const definition = participant.form_versions?.definition ?? { questions: [] }
  const typeKey = participant.participant_types?.key
  const answersInput =
    body?.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? body.answers
      : {}

  const { valid, errors, cleaned } = validateParticipantAnswers(
    definition,
    typeKey,
    answersInput
  )
  if (!valid) {
    return NextResponse.json({ error: 'validation', details: errors }, { status: 422 })
  }

  const { error } = await supabase.rpc('update_own_participant', {
    p_participant_id: participantId,
    p_first_name: asString(body?.firstName),
    p_last_name: asString(body?.lastName),
    p_email: asString(body?.email) || null,
    p_answers: cleaned,
  })
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const windowClosed = ['registration is closed', 'registration has not opened yet', 'event not open for changes', 'participant is cancelled']
      .some((m) => error.message?.includes(m))
    if (windowClosed) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('update_own_participant failed:', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
