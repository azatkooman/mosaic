import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rate-limit'
import {
  REGFILES_BUCKET,
  collectParticipantFilePaths,
  removePaths,
} from '@/lib/storage-purge'

/**
 * Permanently delete registrations, then their uploaded files.
 *
 * This exists rather than calling `purge_participants` straight from the
 * browser because SQL cannot reach storage: deleting the rows alone would
 * leave every file answer orphaned in the bucket. Doing both here keeps it one
 * server-controlled sequence that can report what it could not remove.
 *
 * The RPC is called with the CALLER's client, not the service-role one:
 * `purge_participants` gates on `private.is_admin()`, which reads `auth.uid()`
 * — a service-role call has none and would be rejected. That also keeps the
 * database function the authority on who may do this. The service-role client
 * is used only for storage, where the policies gate on organizer privileges
 * that no longer make sense once the rows are gone.
 *
 * Body: { participantIds: string[] }
 */
export async function POST(request) {
  const rateLimitRes = enforceRateLimit(request, {
    limit: 10,
    windowMs: 60000,
    keyPrefix: 'purge-participants',
  })
  if (rateLimitRes) return rateLimitRes

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

  const { participantIds } = body ?? {}
  if (
    !Array.isArray(participantIds) ||
    participantIds.length === 0 ||
    participantIds.length > 500 ||
    !participantIds.every((id) => typeof id === 'string')
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // Read the file answers BEFORE the rows are deleted — afterwards there is
  // nothing left to tell us which objects belonged to them.
  const { data: participants } = await supabase
    .from('participants')
    .select('id, answers, form_versions ( definition )')
    .in('id', participantIds)
  const filePaths = collectParticipantFilePaths(participants ?? [])

  const { data: result, error } = await supabase.rpc('purge_participants', {
    p_participant_ids: participantIds,
  })
  if (error) {
    // The eligibility rule is the one the console already explains, so it is
    // worth distinguishing from a genuine failure.
    const status = error.message?.includes('must be cancelled')
      ? 409
      : error.message?.includes('not allowed')
        ? 403
        : 500
    if (status === 500) console.error('purge_participants failed:', error.message)
    return NextResponse.json({ error: error.message }, { status })
  }

  // Rows are gone and cannot come back, so a storage failure is reported, not
  // raised: the caller's request did succeed.
  let storage = { removed: 0, failed: [] }
  if (filePaths.length > 0) {
    storage = await removePaths(getSupabaseAdminClient(), REGFILES_BUCKET, filePaths)
    if (storage.failed.length > 0) {
      console.error(
        `purge-participants: ${storage.failed.length} file(s) left in ${REGFILES_BUCKET}:`,
        storage.failed
      )
    }
  }

  return NextResponse.json({ ...result, storage })
}
