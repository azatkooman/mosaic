import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { notifyStatusChange } from '@/lib/notify'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Update participant status (single or bulk) and send notification email(s).
 * Body: { participantIds: string[], status: string }
 *
 * `locale` used to come from the body — the ORGANIZER's UI language — and was
 * used for the attendee's email. Each recipient's language is now resolved
 * from their own registration/profile in lib/notify.js.
 */
export async function POST(request) {
  const rateLimitRes = enforceRateLimit(request, { limit: 30, windowMs: 60000, keyPrefix: 'status-change' })
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

  const { participantIds, status } = body ?? {}
  if (!Array.isArray(participantIds) || participantIds.length === 0 || typeof status !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const admin = getSupabaseAdminClient()
  const results = []
  let failures = 0

  for (const pid of participantIds) {
    const { data: rpcRes, error } = await supabase.rpc('transition_participant_status', {
      p_participant_id: pid,
      p_new_status: status,
    })
    if (error) {
      failures++
      results.push({ id: pid, error: error.message })
    } else {
      results.push({ id: pid, data: rpcRes })

      // The participant whose status changed, plus anyone the change promoted
      // off the waitlist. Off the response path: the write has committed.
      const targets = [{ participantId: pid, status }]
      if (rpcRes?.promoted_participant_id) {
        targets.push({ participantId: rpcRes.promoted_participant_id, status: 'confirmed' })
      }
      notifyStatusChange(admin, targets, {
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
      }).catch((err) => console.error('Failed to send status change email:', err))
    }
  }

  if (failures === participantIds.length) {
    const firstError = results.find((r) => r.error)?.error || 'Failed to update status'
    return NextResponse.json({ error: firstError }, { status: 400 })
  }

  return NextResponse.json({ ok: true, failures, results })
}
