'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui'
import { Link } from '@/lib/i18n/navigation'

/**
 * The staff view of a scanned ticket: who it is, their status, and one big
 * check-in button. Shown after a phone's camera app opened /t/<code>.
 */
export function TicketCheckInCard({ info, code, eventName }) {
  const t = useTranslations('checkin')
  const tStatus = useTranslations('status')
  const locale = useLocale()
  const supabase = getSupabaseBrowserClient()

  // null while untouched; afterwards the check_in_participant result.
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const name = `${info.first_name ?? ''} ${info.last_name ?? ''}`.trim() || info.reg_no
  const checkedInAt = result?.outcome === 'ok' ? result.checked_in_at : info.checked_in_at

  async function checkIn() {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('check_in_participant', { p_ticket_code: code })
      setResult(error ? { outcome: 'error' } : data)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ padding: 'var(--s-5)', display: 'grid', gap: 'var(--s-4)', justifyItems: 'center', textAlign: 'center' }}>
      {eventName && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{eventName}</p>}
      <h1 className="page-title" style={{ margin: 0 }}>{name}</h1>
      {info.type_name && <p style={{ margin: 0 }}>{t('typeLabel')}: {typeof info.type_name === 'object' ? (info.type_name[locale] ?? Object.values(info.type_name)[0]) : info.type_name}</p>}
      {info.reg_no && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{t('regNo')}: {info.reg_no}</p>}
      <Badge tone={info.status}>{tStatus(info.status)}</Badge>

      {result?.outcome === 'ok' ? (
        <p className="alert alert-success" role="status">{t('outcome.ok')}</p>
      ) : result?.outcome === 'error' ? (
        <p className="alert alert-error" role="alert">{t('outcome.error')}</p>
      ) : checkedInAt ? (
        <p className="alert" role="status">
          {t('outcome.already', { time: new Date(checkedInAt).toLocaleTimeString(locale) })}
        </p>
      ) : info.status !== 'confirmed' ? (
        <p className="alert alert-error" role="alert">
          {t('outcome.rejected', { status: tStatus(info.status) })}
        </p>
      ) : (
        <button className="btn btn-primary" onClick={checkIn} disabled={busy}>
          {busy ? t('checkingIn') : t('checkInAction')}
        </button>
      )}

      <Link href={`/console/events/${info.event_id}/checkin`} className="btn btn-ghost btn-sm">
        {t('openScanner')}
      </Link>
    </div>
  )
}
