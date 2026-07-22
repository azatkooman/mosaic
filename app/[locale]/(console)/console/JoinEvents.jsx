'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { useDateFormatPrefs } from '@/components/providers/DateFormatProvider'
import { Badge, Button, Field, Input } from '@/components/ui'

/**
 * Published events the user isn't part of: request access to join the
 * team, or cancel a pending request. Approval happens on the event's Team
 * page or in the admin console.
 */
export function JoinEvents({ events, requestedEventIds, allAccess = false }) {
  const t = useTranslations('console')
  const locale = useLocale()
  const dateFmt = useDateFormatPrefs()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [code, setCode] = useState('')
  const requested = new Set(requestedEventIds)

  async function run(eventId, promise) {
    setError(null)
    setBusyId(eventId)
    const { error } = await promise
    setBusyId(null)
    if (error) setError(error.message)
    else router.refresh()
  }

  function request(eventId) {
    run(eventId, supabase.rpc('request_event_access', { p_event_id: eventId }))
  }

  function cancel(eventId) {
    run(
      eventId,
      supabase
        .from('event_organizers')
        .delete()
        .eq('event_id', eventId)
        .eq('status', 'requested')
    )
  }

  async function requestByCode(e) {
    e.preventDefault()
    setError(null)
    setBusyId('code')
    const { error } = await supabase.rpc('request_event_access_by_slug', {
      p_slug: code,
    })
    setBusyId(null)
    if (error) setError(error.message)
    else {
      setCode('')
      router.refresh()
    }
  }

  return (
    <section aria-label={t('joinEvents')} style={{ marginBlockStart: 'var(--s-8)' }}>
      <h2>{t('joinEvents')}</h2>
      <p style={{ color: 'var(--ink-soft)', marginBlock: 'var(--s-3)' }}>
        {t('joinEventsHelp')}
      </p>
      {error && <p className="alert alert-error">{error}</p>}
      {allAccess ? (
        <p className="alert alert-info">{t('joinEventsAllAccess')}</p>
      ) : events.length === 0 ? (
        <p className="alert alert-info">{t('joinEventsEmpty')}</p>
      ) : (
      <div className="table-wrap" style={{ maxInlineSize: '44rem' }}>
        <table className="table">
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <strong>{lt(event.name, locale, event.default_locale)}</strong>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                    {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale, dateFmt)}
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
                      variant="secondary"
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

      {!allAccess && (
        <form
          onSubmit={requestByCode}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--s-3)', marginBlockStart: 'var(--s-4)', maxInlineSize: '28rem' }}
        >
          <div style={{ flex: 1 }}>
            <Field label={t('joinByCode')} help={t('joinByCodeHelp')}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="summer-conference-2026"
                />
              )}
            </Field>
          </div>
          <Button type="submit" disabled={!code.trim() || busyId === 'code'}>
            {t('requestAccess')}
          </Button>
        </form>
      )}
    </section>
  )
}
