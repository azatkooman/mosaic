import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/notify-role
 * Body: { email: string, role: string }
 *
 * Called by the admin console after successfully granting a global role.
 * Sends a notification email to the user. Only admins may call this
 * (verified via the caller's Supabase session).
 */
export async function POST(request) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  }

  // Verify the caller is an admin.
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
  const isAdmin = (roles ?? []).some(
    (r) => r.role === 'admin' || r.role === 'super_admin'
  )
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const { email, role } = body ?? {}
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'missing_email' }, { status: 400 })
  }

  // Look up the target user's name.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  const name = profile?.full_name || email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mosaic.cru.org'
  const consoleUrl = `${siteUrl}/en/console`

  const roleName =
    role === 'admin' ? 'Admin' : 'Global Organizer'

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <p style="font-size: 16px; line-height: 1.6; color: #1a1a1a;">
        Dear ${escapeHtml(name)},
      </p>
      <p style="font-size: 16px; line-height: 1.6; color: #1a1a1a;">
        You have been added as a <strong>${roleName}</strong> for Mosaic Events.
        You now have access to manage events from the organizer console.
      </p>
      <p style="margin: 28px 0;">
        <a href="${consoleUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2c6e5a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Go to Mosaic Console →
        </a>
      </p>
      <p style="font-size: 13px; color: #666; line-height: 1.5;">
        If you have questions, please reach out to your event administrator.
      </p>
    </div>
  `.trim()

  try {
    await sendEmail({
      to: email.trim(),
      subject: `You've been added as a ${roleName} on Mosaic`,
      html,
    })
  } catch (err) {
    console.error('Failed to send role notification email:', err.message)
    return NextResponse.json({ error: 'email_failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
