import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { eventMediaUrl } from '@/lib/storage'
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
  const faviconPath = event.page_content?.favicon_path
  const meta = {
    title: lt(event.name, locale, event.default_locale),
    description: lt(event.description, locale, event.default_locale)?.slice(0, 160),
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `/${l}/events/${slug}`])
      ),
    },
  }
  if (faviconPath) meta.icons = { icon: eventMediaUrl(faviconPath) }
  return meta
}

export default async function EventPage({ params, searchParams }) {
  const { slug, locale } = await params
  const { lang } = (await searchParams) ?? {}
  setRequestLocale(locale)

  const event = await getEvent(slug)
  if (!event) notFound()

  // A ?lang= custom language (defined by the organizer) resolves the content;
  // dates/UI stay in the route locale. Only honor codes the event actually has.
  const customCodes = Array.isArray(event.page_content?.i18n?.custom)
    ? event.page_content.i18n.custom.map((c) => c.code)
    : []
  const available = event.page_content?.i18n?.available ?? []
  const contentLocale =
    lang && customCodes.includes(lang) && available.includes(lang) ? lang : locale

  return (
    <EventPageView
      event={event}
      locale={locale}
      contentLocale={contentLocale}
      registerHref={`/${locale}/events/${slug}/register`}
    />
  )
}
