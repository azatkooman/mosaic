import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { CheckinScanner } from './CheckinScanner'

export const dynamic = 'force-dynamic'

export default async function CheckinPage({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations('checkin')

  const supabase = await getSupabaseServerClient()
  const { data: canCheckin } = await supabase.rpc('can_checkin_event_api', { eid: eventId })

  if (!canCheckin) {
    return <p className="alert alert-error">{t('noAccess')}</p>
  }

  return <CheckinScanner eventId={eventId} />
}
