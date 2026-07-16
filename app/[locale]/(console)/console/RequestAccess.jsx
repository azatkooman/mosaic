'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { Badge, Button } from '@/components/ui'

/**
 * Shown in place of the console for signed-in users with no organizer access.
 * Lets them ask for access to a published event; an admin or full organizer
 * approves the request at a chosen level from the admin console or team page.
 */
export function RequestAccess({ events, requestedEventIds }) {
  const t = useTranslations('console')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const requested = new Set(requestedEventIds)

  async function request(eventId) {
    setError(null)
    setBusyId(eventId)
    const { error } = await supabase.rpc('request_event_access', {
      p_event_id: eventId,
    })
    setBusyId(null)
    if (error) setError(error.message)
    else router.refresh()
  }

  async function cancel(eventId) {
    setError(null)
    setBusyId(eventId)
    const { error } = await supabase
      .from('event_organizers')
      .delete()
      .eq('event_id', eventId)
      .eq('role', 'requested')
    setBusyId(null)
    if (error) setError(error.message)
    else router.refresh()
  }

  return (
    <div style={{ maxInlineSize: '44rem' }}>
      <h1 className="page-title">{t('requestAccessTitle')}</h1>
      <p style={{ color: 'var(--ink-soft)', marginBlock: 'var(--s-3)' }}>
        {t('requestAccessIntro')}
      </p>
      {error && <p className="alert alert-error">{error}</p>}
      {events.length === 0 ? (
        <p className="alert alert-info">{t('noPublishedEvents')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{lt(event.name, locale, event.default_locale)}</strong>
                    <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                      {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)}
                    </div>
                  </td>
                  <td style={{ textAlign: 'end' }}>
                    {requested.has(event.id) ? (
                      <>
                        <Badge tone="draft">{t('accessRequested')}</Badge>{' '}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === event.id}
                          onClick={() => cancel(event.id)}
                        >
                          {t('cancelRequest')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busyId === event.id}
                        onClick={() => request(event.id)}
                      >
                        {t('requestAccess')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
