import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendStatusChangeEmail } from '@/lib/email'
import { lt } from '@/lib/i18n/locales'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Update participant status (single or bulk) and send notification email(s).
 * Body: { participantIds: string[], status: string, locale?: string }
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

  const { participantIds, status, locale = 'en' } = body ?? {}
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

      // Dispatch status emails asynchronously for the target participant and any waitlist-promoted candidate
      const targetIds = [pid]
      if (rpcRes?.promoted_participant_id) {
        targetIds.push(rpcRes.promoted_participant_id)
      }

      for (const targetId of targetIds) {
        const targetStatus = targetId === rpcRes?.promoted_participant_id ? 'confirmed' : status
        admin
          .from('participants')
          .select('first_name, last_name, email, profile_email, events!inner ( name, default_locale )')
          .eq('id', targetId)
          .single()
          .then(({ data: pData }) => {
            if (!pData) return
            const recipientEmail = pData.email || pData.profile_email
            if (!recipientEmail) return

            const eventName = lt(pData.events?.name, locale, pData.events?.default_locale) || 'Event'
            const participantName = [pData.first_name, pData.last_name].filter(Boolean).join(' ') || recipientEmail

            sendStatusChangeEmail({
              recipientEmail,
              participantName,
              eventName,
              newStatus: targetStatus,
              siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
              locale,
            }).catch((err) => console.error('Failed to send status change email async:', err))
          })
          .catch((err) => console.error('Failed to fetch participant for status email:', err))
      }
    }
  }

  if (failures === participantIds.length) {
    const firstError = results.find((r) => r.error)?.error || 'Failed to update status'
    return NextResponse.json({ error: firstError }, { status: 400 })
  }

  return NextResponse.json({ ok: true, failures, results })
}
