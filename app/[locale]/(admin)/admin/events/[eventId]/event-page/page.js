import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { EventPageView } from '@/components/event-page/EventPageView'

export const dynamic = 'force-dynamic'

/**
 * The attendee-facing event page, exactly as it was published.
 *
 * `editable` is left false — its default — which is the same mode the public
 * route uses, so there are no per-section edit pencils and the register CTA
 * renders as an inert span rather than a link. Reusing the real component
 * rather than re-describing the content is the point: an admin reviewing an
 * archived event sees what attendees saw, not a summary of it.
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
      <EventPageView event={event} locale={locale} contentLocale={event.default_locale} />
    </div>
  )
}
