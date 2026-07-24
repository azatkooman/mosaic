import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { validateParticipantAnswers } from '@/lib/form-engine/validate'
import { extractIdentity } from '@/lib/form-engine/identity'

/**
 * Authoritative registration endpoint — the ONLY caller of the
 * submit_registration RPC (which is service-role-only, so this validation
 * cannot be bypassed by calling PostgREST directly). Re-runs the same
 * shared validation the browser ran, prunes hidden answers, verifies
 * file-answer ownership, then submits atomically.
 *
 * Body: { eventId, locale, registrationMode, participants: [{
 *   participantTypeKey, firstName, lastName, email, answers }] }
 */
export async function POST(request) {
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

  const { eventId, locale, registrationMode, participants } = body ?? {}
  if (
    typeof eventId !== 'string' ||
    !Array.isArray(participants) ||
    participants.length === 0 ||
    participants.length > 25
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const mode =
    registrationMode === 'single' || registrationMode === 'family'
      ? registrationMode
      : null
  // A single registration is exactly one person.
  if (mode === 'single' && participants.length !== 1) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // Load participant types + their current published form versions (RLS lets
  // anyone read these for published events).
  const { data: types, error: typesError } = await supabase
    .from('participant_types')
    .select('id, key, max_per_registration, form_id, forms:form_id ( id, current_version_id )')
    .eq('event_id', eventId)
  if (typesError || !types?.length) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
  }

  // The published form for the chosen registration mode (single/family)
  // overrides each type's own form — mirroring what the wizard rendered.
  let modeVersionId = null
  if (mode) {
    const { data: modeForm } = await supabase
      .from('forms')
      .select('current_version_id')
      .eq('event_id', eventId)
      .eq('registration_mode', mode)
      .maybeSingle()
    modeVersionId = modeForm?.current_version_id ?? null
  }

  const versionIds = [
    ...new Set(
      [...types.map((t) => t.forms?.current_version_id), modeVersionId].filter(Boolean)
    ),
  ]
  const { data: versions } = await supabase
    .from('form_versions')
    .select('id, definition')
    .in('id', versionIds)
  const versionById = new Map((versions ?? []).map((v) => [v.id, v]))
  const typeByKey = new Map(types.map((t) => [t.key, t]))

  const asString = (v) => (typeof v === 'string' ? v.trim() : '')

  // Validate every participant against their type's form definition.
  const rpcParticipants = []
  const validationErrors = []
  const countByType = new Map()
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i] ?? {}
    const type = typeByKey.get(p.participantTypeKey)
    const versionId = modeVersionId ?? type?.forms?.current_version_id
    const version = versionId ? versionById.get(versionId) : null
    if (!type || !version) {
      return NextResponse.json({ error: 'invalid_participant_type' }, { status: 400 })
    }
    countByType.set(type.key, (countByType.get(type.key) ?? 0) + 1)

    const answersInput =
      p.answers && typeof p.answers === 'object' && !Array.isArray(p.answers)
        ? p.answers
        : {}
    const { valid, errors, cleaned } = validateParticipantAnswers(
      version.definition,
      type.key,
      answersInput
    )
    if (!valid) {
      validationErrors.push({ index: i, errors })
      continue
    }

    // File answers must point at objects the caller uploaded for THIS event:
    // registration-files paths are {event_id}/{user_id}/{uuid}-{name}.
    const fileErrors = {}
    for (const q of version.definition?.questions ?? []) {
      if (q.type === 'file' && cleaned[q.id] != null) {
        if (!String(cleaned[q.id]).startsWith(`${eventId}/${user.id}/`)) {
          fileErrors[q.id] = 'invalid'
        }
      }
    }
    if (Object.keys(fileErrors).length > 0) {
      validationErrors.push({ index: i, errors: fileErrors })
      continue
    }

    // Identity comes from the name/email questions (organizers may remove
    // them, so blanks are legal). Legacy clients that still send top-level
    // firstName/lastName/email are honored as a fallback.
    const identity = extractIdentity(version.definition, type.key, cleaned)
    rpcParticipants.push({
      participant_type_id: type.id,
      form_version_id: version.id,
      first_name: identity.firstName || asString(p.firstName),
      last_name: identity.lastName || asString(p.lastName),
      email: identity.email || asString(p.email) || null,
      answers: cleaned,
    })
  }

  // Per-type limits (the RPC re-checks; failing early gives a clean 422).
  for (const [key, n] of countByType) {
    const type = typeByKey.get(key)
    if (type.max_per_registration != null && n > type.max_per_registration) {
      return NextResponse.json(
        { error: 'too_many_of_type', typeKey: key },
        { status: 422 }
      )
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: 'validation', details: validationErrors }, { status: 422 })
  }

  // Atomic insert with capacity enforcement. Service role is required (the
  // RPC accepts no other caller); the registrant id is passed explicitly
  // after cookie-verified authentication above.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const { data, error } = await admin.rpc('submit_registration', {
    p_event_id: eventId,
    p_locale: typeof locale === 'string' ? locale : 'en',
    p_participants: rpcParticipants,
    p_registered_by: user.id,
  })
  if (error) {
    const businessErrors = [
      'registration is closed',
      'registration has not opened yet',
      'event not open for registration',
      'too many participants',
      'too few participants',
    ]
    const known = businessErrors.some((m) => error.message?.includes(m))
      || error.message?.includes('already registered')
    if (known) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('submit_registration failed:', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // Capture the registrant's name for their profile if we still don't have
  // one. Magic-link sign-ins carry no name metadata, and a user who arrives
  // via an event link registers on /events/... where the welcome dialog is
  // suppressed — so this is often the only moment their name is given. Only
  // in single mode is the sole participant definitively the account holder.
  if (mode === 'single' && rpcParticipants[0]) {
    const selfName = [rpcParticipants[0].first_name, rpcParticipants[0].last_name]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (selfName) {
      const { data: me } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      if (!me?.full_name?.trim()) {
        // RLS lets a user update only their own profile; ignore failures —
        // this is a best-effort convenience, not part of the registration.
        await supabase.from('profiles').update({ full_name: selfName }).eq('id', user.id)
      }
    }
  }

  return NextResponse.json(data)
}
