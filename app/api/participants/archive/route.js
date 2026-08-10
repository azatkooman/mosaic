import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { notifyPromoted } from '@/lib/notify'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Archive participants, and tell anyone the archive promoted off the waitlist.
 * Body: { participantIds: string[] }
 *
 * The console used to call soft_delete_participants straight from the browser
 * and throw away its `promoted` array, so freeing a seat silently confirmed
 * the next person in line and never told them. The RPC still runs as the
 * signed-in user — it re-checks the delete privilege per participant — and the
 * service-role client is used only to read the promoted rows for their mail.
 */
export async function POST(request) {
  const rateLimitRes = enforceRateLimit(request, {
    limit: 30,
    windowMs: 60000,
    keyPrefix: 'archive',
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
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('soft_delete_participants', {
    p_participant_ids: participantIds,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Off the response path on purpose: the archive has committed, and a mail
  // failure (or unconfigured SMTP) must not report it as failed.
  const promoted = Array.isArray(data?.promoted) ? data.promoted : []
  if (promoted.length > 0) {
    notifyPromoted(getSupabaseAdminClient(), promoted, {
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
    }).catch((err) => console.error('Failed to notify promoted participants:', err))
  }

  return NextResponse.json({ ok: true, ...data })
}
