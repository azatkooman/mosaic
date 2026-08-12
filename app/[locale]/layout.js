import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/lib/i18n/routing'
import { THEME_COOKIE } from '@/lib/theme'
import { DATEFMT_COOKIE, parseDateFmtCookie } from '@/lib/date-format'
import { DateFormatProvider } from '@/components/providers/DateFormatProvider'
import '@/styles/fonts.css'
import '@/styles/globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const metadata = {
  title: {
    default: 'Mosaic',
    template: '%s · Mosaic',
  },
  description: 'Event registration for conferences, camps and gatherings.',
}

// Next injects width/initial-scale by default; declaring it makes the contract
// explicit and adds viewport-fit=cover, which is what turns on env(safe-area-
// inset-*). Layout helpers and the sticky bars pad by those insets so a notch
// or home indicator never covers content. No maximum-scale or user-scalable —
// pinch-zoom must stay available.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  setRequestLocale(locale)

  // Explicit theme choice (from the profile) is mirrored to a cookie so the
  // right theme is in the very first HTML — no flash of the wrong palette.
  // Absent/'system' → no attribute, so prefers-color-scheme decides.
  const cookieStore = await cookies()
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value
  const theme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined
  // Same pattern for date/time format prefs; client components read them
  // from context, server components from lib/date-format-server.
  const dateFmtPrefs = parseDateFmtCookie(cookieStore.get(DATEFMT_COOKIE)?.value)

  return (
    <html lang={locale} dir="ltr" data-theme={theme}>
      <body>
        <NextIntlClientProvider>
          <DateFormatProvider value={dateFmtPrefs}>{children}</DateFormatProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
