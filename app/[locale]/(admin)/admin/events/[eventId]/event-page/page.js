import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ReadOnlyEventPage } from './ReadOnlyEventPage'

export const dynamic = 'force-dynamic'

/**
 * The attendee-facing event page, exactly as it was published.
 *
 * `editable` stays false so there are no per-section edit pencils, and
 * `navigable` is false (see ReadOnlyEventPage) so the back, register and
 * language controls cannot carry the admin out of the console. Reusing the
 * real component rather than re-describing the content is the point: an admin
 * reviewing an archived event sees what attendees saw, not a summary of it.
 */
export default async function AdminEventPageView({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) notFound()

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
      }}
    >
      <ReadOnlyEventPage event={event} locale={locale} />
    </div>
  )
}
