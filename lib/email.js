import nodemailer from 'nodemailer'

/**
 * Shared nodemailer transporter. Uses the same SMTP credentials you
 * configured for Supabase Auth magic links — just add them as env vars
 * to your Vercel project:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
let _transporter

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  return _transporter
}

/**
 * Send an email. Throws if SMTP is not configured.
 * @param {{ to: string, subject: string, html: string }} opts
 */
/**
 * Send an email. Returns false gracefully if SMTP is not configured.
 * @param {{ to: string, subject: string, html: string }} opts
 */
export async function sendEmail({ to, subject, html }) {
  const from = process.env.SMTP_FROM
  if (!from || !process.env.SMTP_HOST) {
    console.warn('SMTP is not configured (missing SMTP_HOST / SMTP_FROM). Skipping email to:', to)
    return false
  }
  try {
    await getTransporter().sendMail({ from, to, subject, html })
    return true
  } catch (err) {
    console.error('Failed to send email:', err)
    return false
  }
}

/**
 * Sends a registration confirmation email with event and participant details.
 */
export async function sendRegistrationConfirmationEmail({ recipientEmail, recipientName, eventName, participants, siteUrl, locale = 'en' }) {
  if (!recipientEmail) return false

  const participantRows = participants
    .map(
      (p) =>
        `<tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 12px;">${escapeHtml(p.first_name || '')} ${escapeHtml(p.last_name || '')}</td>
          <td style="padding: 8px 12px; text-transform: capitalize;"><strong>${escapeHtml(p.status || 'confirmed')}</strong></td>
        </tr>`
    )
    .join('')

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #111827;">Registration Received for ${escapeHtml(eventName)}</h2>
      <p>Hello ${escapeHtml(recipientName || recipientEmail)},</p>
      <p>Thank you for registering! Below are your registration details:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; text-align: left;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 8px 12px;">Participant</th>
            <th style="padding: 8px 12px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${participantRows}
        </tbody>
      </table>

      ${siteUrl ? `<p><a href="${siteUrl}/${locale}/my/registrations" style="background-color: #2563eb; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">View My Registrations</a></p>` : ''}
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      <p style="color: #6b7280; font-size: 0.875rem;">This is an automated message from Mosaic.</p>
    </div>
  `

  return sendEmail({
    to: recipientEmail,
    subject: `Registration Confirmation: ${eventName}`,
    html,
  })
}

/**
 * Sends an email notification when a participant's status changes (e.g. waitlist promotion).
 */
export async function sendStatusChangeEmail({ recipientEmail, participantName, eventName, newStatus, siteUrl, locale = 'en' }) {
  if (!recipientEmail) return false

  const isConfirmed = newStatus === 'confirmed'
  const subject = isConfirmed
    ? `Great news! You are confirmed for ${eventName}`
    : `Registration status updated for ${eventName}`

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #111827;">Status Update: ${escapeHtml(eventName)}</h2>
      <p>Hello ${escapeHtml(participantName || recipientEmail)},</p>
      <p>Your registration status for <strong>${escapeHtml(eventName)}</strong> has been updated to: <strong style="text-transform: uppercase; color: ${isConfirmed ? '#16a34a' : '#d97706'};">${escapeHtml(newStatus)}</strong>.</p>
      
      ${isConfirmed ? `<p style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px;">You have been moved from the waitlist and your spot is now <strong>CONFIRMED</strong>!</p>` : ''}

      ${siteUrl ? `<p><a href="${siteUrl}/${locale}/my/registrations" style="background-color: #2563eb; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">View Registration Details</a></p>` : ''}
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      <p style="color: #6b7280; font-size: 0.875rem;">This is an automated message from Mosaic.</p>
    </div>
  `

  return sendEmail({
    to: recipientEmail,
    subject,
    html,
  })
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

