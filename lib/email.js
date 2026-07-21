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
export async function sendEmail({ to, subject, html }) {
  const from = process.env.SMTP_FROM
  if (!from || !process.env.SMTP_HOST) {
    throw new Error('SMTP is not configured (missing SMTP_HOST / SMTP_FROM)')
  }
  return getTransporter().sendMail({ from, to, subject, html })
}
