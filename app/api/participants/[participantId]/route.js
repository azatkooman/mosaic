import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { validateParticipantAnswers } from '@/lib/form-engine/validate'

/**
 * Edit a registrant's details from the organizer console.
 *
 * Answers are re-validated with the same shared engine registration uses,
 * against the form version THIS participant answered (not the current draft),
 * then written through the update_participant RPC, which re-checks the
 * can_add_registrants privilege. Runs as the signed-in user, so RLS + the
 * RPC's own check both apply.
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
  const firstName = asString(body?.firstName)
  const lastName = asString(body?.lastName)
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'validation', details: { _name: 'required' } }, { status: 422 })
  }

  // Load the participant with its type key and the exact form version it
  // answered — RLS returns it only if the caller can view the event.
  const { data: participant, error: loadError } = await supabase
    .from('participants')
    .select('id, participant_type_id, form_version_id, participant_types ( key ), form_versions ( definition )')
    .eq('id', participantId)
    .maybeSingle()
  if (loadError || !participant) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
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

  const { error } = await supabase.rpc('update_participant', {
    p_participant_id: participantId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: asString(body?.email) || null,
    p_answers: cleaned,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : 500
    if (status === 500) console.error('update_participant failed:', error.message)
    return NextResponse.json({ error: status === 403 ? 'forbidden' : 'internal' }, { status })
  }

  return NextResponse.json({ ok: true })
}
