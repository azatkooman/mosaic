import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { EventPageView } from '@/components/event-page/EventPageView'

export const revalidate = 300

async function getEvent(slug) {
  const supabase = getSupabaseAnonClient()
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }) {
  const { slug, locale } = await params
  const event = await getEvent(slug)
  if (!event) return {}
  return {
    title: lt(event.name, locale, event.default_locale),
    description: lt(event.description, locale, event.default_locale)?.slice(0, 160),
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `/${l}/events/${slug}`])
      ),
    },
  }
}

export default async function EventPage({ params }) {
  const { slug, locale } = await params
  setRequestLocale(locale)

  const event = await getEvent(slug)
  if (!event) notFound()

  return (
    <EventPageView
      event={event}
      locale={locale}
      registerHref={`/${locale}/events/${slug}/register`}
    />
  )
}
