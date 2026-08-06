import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt, eventLocales, localeName } from '@/lib/i18n/locales'
import { formatEventDate } from '@/lib/dates'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { DescriptionList } from '../DescriptionList'

export const dynamic = 'force-dynamic'

/**
 * Read-only settings. The same fields the Events Hub's settings form edits,
 * rendered as values — no inputs, so there is nothing to submit.
 */
export default async function AdminEventSettings({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

  const supabase = await getSupabaseServerClient()
  const [{ data: event }, { data: types }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
    supabase
      .from('participant_types')
      .select('id, key, name, capacity, min_per_registration, max_per_registration, sort_order')
      .eq('event_id', eventId)
      .order('sort_order'),
  ])
  if (!event) notFound()

  // formatEventDate already carries the time; dateFmt is the viewer's
  // date/time-format preference.
  const when = (iso) => (iso ? formatEventDate(iso, event.timezone, locale, dateFmt) : '—')

  // Primary contact first, then the extras, with fully blank entries dropped —
  // the same combine EventPageView does for the public Contact section.
  const contact = event.contact ?? {}
  const contacts = [
    { name: contact.name, email: contact.email, phone: contact.phone, website: contact.website },
    ...(Array.isArray(contact.people) ? contact.people : []),
  ].filter((c) => c && (c.name || c.email || c.phone || c.website))

  const rows = [
    { label: t('console.eventName'), value: lt(event.name, locale, event.default_locale) },
    { label: t('console.slug'), value: event.slug },
    { label: t('console.description'), value: lt(event.description, locale, event.default_locale) || '—' },
    { label: t('console.timezone'), value: event.timezone },
    { label: t('console.startsAt'), value: when(event.starts_at) },
    { label: t('console.endsAt'), value: when(event.ends_at) },
    { label: t('console.regOpens'), value: when(event.registration_opens_at) },
    { label: t('console.regCloses'), value: when(event.registration_closes_at) },
    { label: t('console.capacity'), value: event.capacity ?? t('console.capacityHelp') },
    { label: t('console.visibility'), value: event.visibility },
    {
      label: t('console.defaultLanguage'),
      value: localeName(event, event.default_locale),
    },
    {
      label: t('console.availableLanguages'),
      value: eventLocales(event).map((code) => localeName(event, code)).join(', ') || '—',
    },
  ]

  return (
    <>
      <DescriptionList rows={rows} />

      {/* Contact lives on events.contact (a top-level column, not page_content):
          the primary contact is the flat name/email/phone/website, and any
          extras are contact.people[] — the same shape the Settings form edits
          and the event page's Contact section renders. */}
      <h2 className="eyebrow" style={{ marginBlock: 'var(--s-5) var(--s-3)' }}>
        {t('console.contactInfo')}
      </h2>
      {contacts.length === 0 ? (
        <p className="alert alert-info">{t('console.adminNothingHere')}</p>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr>
                <th>{t('console.contactName')}</th>
                <th>{t('console.contactEmail')}</th>
                <th>{t('console.contactPhone')}</th>
                <th>{t('console.contactWebsite')}</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={i}>
                  <td data-cell="title">{c.name || '—'}</td>
                  <td data-label={t('console.contactEmail')}>{c.email || '—'}</td>
                  <td data-label={t('console.contactPhone')}>{c.phone || '—'}</td>
                  <td data-label={t('console.contactWebsite')}>{c.website || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="eyebrow" style={{ marginBlock: 'var(--s-5) var(--s-3)' }}>
        {t('console.participantTypes')}
      </h2>
      {(types ?? []).length === 0 ? (
        <p className="alert alert-info">{t('console.adminNothingHere')}</p>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr>
                <th>{t('console.typeName')}</th>
                <th>{t('console.typeKey')}</th>
                <th>{t('console.capacity')}</th>
                <th>{t('console.adminPerRegistration')}</th>
              </tr>
            </thead>
            <tbody>
              {(types ?? []).map((pt) => (
                <tr key={pt.id}>
                  <td data-cell="title">{lt(pt.name, locale, event.default_locale)}</td>
                  <td data-label={t('console.typeKey')}>
                    <code>{pt.key}</code>
                  </td>
                  <td data-label={t('console.capacity')}>{pt.capacity ?? '—'}</td>
                  <td data-label={t('console.adminPerRegistration')}>
                    {pt.min_per_registration}–{pt.max_per_registration}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
