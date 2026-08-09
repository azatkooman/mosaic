import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { Link } from '@/lib/i18n/navigation'
import { MosaicMark } from '@/components/ui'
import { TicketCheckInCard } from './TicketCheckInCard'

export const dynamic = 'force-dynamic'

/**
 * Landing page for a scanned ticket QR (any camera app opens this URL).
 * Staff holding the event's check-in privilege see the ticket and can check
 * it in; everyone else — including the ticket holder — gets a generic page
 * with no personal data. ticket_info returns null for unknown codes and for
 * missing privilege alike, so the page is not an oracle for guessing codes.
 */
export default async function TicketPage({ params }) {
  const { locale, code } = await params
  setRequestLocale(locale)
  const t = await getTranslations('checkin')

  const supabase = await getSupabaseServerClient()
  const [{ data: info }, { data: { user } }] = await Promise.all([
    supabase.rpc('ticket_info', { p_ticket_code: code }),
    supabase.auth.getUser(),
  ])

  return (
    <div className="container-narrow" style={{ paddingBlock: 'var(--s-7)', maxInlineSize: '30rem' }}>
      {info ? (
        <TicketCheckInCard
          info={info}
          code={code}
          eventName={lt(info.event_name, locale)}
        />
      ) : (
        <div style={{ textAlign: 'center', display: 'grid', gap: 'var(--s-4)', justifyItems: 'center' }}>
          <MosaicMark />
          <h1 className="page-title">{t('ticketTitle')}</h1>
          <p style={{ color: 'var(--ink-soft)' }}>
            {user ? t('ticketNoAccess') : t('ticketSignInHint')}
          </p>
          {!user && (
            <Link
              className="btn btn-primary"
              href={`/login?next=${encodeURIComponent(`/${locale}/t/${code}`)}`}
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
