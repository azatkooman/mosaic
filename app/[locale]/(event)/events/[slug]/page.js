import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { eventPageUrl } from '@/lib/url'
import { getSupabaseAnonClient } from '@/lib/supabase/server'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { getContentMessages } from '@/lib/i18n/ui-messages-server'
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
        LOCALES.map((l) => [l, eventPageUrl({ slug, code: l })])
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

  // Most of this page's text is event content and already follows
  // contentLocale. What is left is our own chrome — "Registration closed",
  // "Back to home", the language switcher's aria-label — which lives in the
  // message catalog and so only exists in the five platform locales. For a
  // custom language those stayed in the route locale. See lib/i18n/ui-messages.
  const { messages: contentMessages, changed: hasContentMessages } =
    await getContentMessages(contentLocale)

  const view = (
    <EventPageView
      event={event}
      locale={locale}
      contentLocale={contentLocale}
      // Carry the reader's language through to the form: a custom language
      // rides on ?lang=, so a plain path would drop it and show English.
      registerHref={eventPageUrl({
        slug,
        code: contentLocale,
        uiLocale: locale,
        subPath: '/register',
      })}
    />
  )

  // `locale`, not contentLocale: the provider's locale drives Intl formatting
  // and a custom code may not be a locale Intl knows. Only the catalog changes.
  return hasContentMessages ? (
    <NextIntlClientProvider locale={locale} messages={contentMessages}>
      {view}
    </NextIntlClientProvider>
  ) : (
    view
  )
}
