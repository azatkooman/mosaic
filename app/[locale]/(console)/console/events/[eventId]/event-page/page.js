import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { EventPageEditor } from './EventPageEditor'

export const dynamic = 'force-dynamic'

export default async function EventPagePreview({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) notFound()

  return <EventPageEditor initialEvent={event} />
}
