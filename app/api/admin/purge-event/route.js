import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rate-limit'
import {
  COVERS_BUCKET,
  REGFILES_BUCKET,
  listEventStoragePaths,
  removePaths,
} from '@/lib/storage-purge'

/**
 * Permanently delete an event, then everything it stored.
 *
 * Same shape as the participants route and for the same reason — SQL cannot
 * reach storage — but the sweep is by prefix: both buckets namespace under the
 * event id, so this also reclaims cover images, page media and any upload that
 * was never saved onto the event. The `event-covers` bucket is PUBLIC, so
 * leaving those behind would keep a purged event's images downloadable by
 * anyone holding the URL.
 *
 * `purge_event` is called with the CALLER's client: it gates on
 * `private.is_admin()`, which reads `auth.uid()`, so a service-role call would
 * be rejected. The service-role client is used only for storage.
 *
 * Body: { eventId: string }
 */
export async function POST(request) {
  const rateLimitRes = enforceRateLimit(request, {
    limit: 10,
    windowMs: 60000,
    keyPrefix: 'purge-event',
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

  const { eventId } = body ?? {}
  if (typeof eventId !== 'string' || eventId === '') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const admin = getSupabaseAdminClient()

  // List before deleting. The paths are derived from the event id alone, so
  // strictly this would still work afterwards — but reading first keeps the
  // ordering honest and means a listing failure is noticed before anything is
  // destroyed.
  const { covers, regFiles } = await listEventStoragePaths(admin, eventId)

  const { data: result, error } = await supabase.rpc('purge_event', {
    p_event_id: eventId,
  })
  if (error) {
    const status = error.message?.includes('must be archived or ended')
      ? 409
      : error.message?.includes('not allowed')
        ? 403
        : 500
    if (status === 500) console.error('purge_event failed:', error.message)
    return NextResponse.json({ error: error.message }, { status })
  }

  // The event is gone either way; report what storage kept rather than failing.
  const coverResult = await removePaths(admin, COVERS_BUCKET, covers)
  const fileResult = await removePaths(admin, REGFILES_BUCKET, regFiles)
  const failed = [...coverResult.failed, ...fileResult.failed]
  if (failed.length > 0) {
    console.error(`purge-event ${eventId}: ${failed.length} file(s) left in storage:`, failed)
  }

  return NextResponse.json({
    ...result,
    storage: { removed: coverResult.removed + fileResult.removed, failed },
  })
}
