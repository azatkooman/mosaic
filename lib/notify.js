// @ts-check
import { sendStatusChangeEmail } from './email'
import { lt } from './i18n/locales'

/**
 * Which language to write to a participant in.
 *
 * Emphatically NOT the organizer's UI locale, which is what the status route
 * used to pass: a Ukrainian attendee promoted by an English-speaking organizer
 * got English mail even though the registration recorded the right answer.
 * Order of preference: the language they registered in, then their profile
 * preference, then the event's default, then English.
 *
 * @param {{registrationLocale?: string|null, profileLocale?: string|null, eventDefaultLocale?: string|null}} sources
 * @returns {string}
 */
export function resolveRecipientLocale({
  registrationLocale,
  profileLocale,
  eventDefaultLocale,
} = {}) {
  return registrationLocale || profileLocale || eventDefaultLocale || 'en'
}

/**
 * Email participants whose status just changed — including anyone the database
 * promoted off the waitlist as a side effect.
 *
 * Dispatch is deliberately fire-and-forget: the status change or archive has
 * already committed, and sendEmail() returns false (never throws) when SMTP is
 * unconfigured, so a mail problem must not turn a successful write into a
 * failed request.
 *
 * @param {object} admin service-role Supabase client
 * @param {Array<{participantId: string, status: string}>} targets
 * @param {{siteUrl?: string}} [opts]
 * @returns {Promise<number>} how many mails were dispatched
 */
export async function notifyStatusChange(admin, targets, { siteUrl = '' } = {}) {
  let sent = 0
  for (const { participantId, status } of targets) {
    try {
      const { data } = await admin
        .from('participants')
        .select(
          'first_name, last_name, email, profile_email, ' +
            'registrations!inner ( locale, profiles:registered_by ( preferred_locale ) ), ' +
            'events!inner ( name, default_locale )'
        )
        .eq('id', participantId)
        .single()
      if (!data) continue

      const recipientEmail = data.email || data.profile_email
      if (!recipientEmail) continue

      const locale = resolveRecipientLocale({
        registrationLocale: data.registrations?.locale,
        profileLocale: data.registrations?.profiles?.preferred_locale,
        eventDefaultLocale: data.events?.default_locale,
      })
      const eventName = lt(data.events?.name, locale, data.events?.default_locale) || 'Event'
      const participantName =
        [data.first_name, data.last_name].filter(Boolean).join(' ') || recipientEmail

      const ok = await sendStatusChangeEmail({
        recipientEmail,
        participantName,
        eventName,
        newStatus: status,
        siteUrl,
        locale,
      })
      if (ok) sent++
    } catch (err) {
      console.error('Failed to send status change email:', err)
    }
  }
  return sent
}

/**
 * Convenience for the archive path, where every affected participant was
 * promoted off the waitlist and is therefore now confirmed.
 *
 * @param {object} admin
 * @param {Array<string>} participantIds
 * @param {{siteUrl?: string}} [opts]
 */
export function notifyPromoted(admin, participantIds, opts) {
  return notifyStatusChange(
    admin,
    (participantIds ?? []).filter(Boolean).map((participantId) => ({
      participantId,
      status: 'confirmed',
    })),
    opts
  )
}
