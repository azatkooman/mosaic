import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import {
  Unbounded,
  IBM_Plex_Sans,
  Inter,
  Roboto,
  DM_Sans,
  Poppins,
  Plus_Jakarta_Sans,
} from 'next/font/google'
import { routing } from '@/lib/i18n/routing'
import { THEME_COOKIE } from '@/lib/theme'
import { DATEFMT_COOKIE, parseDateFmtCookie } from '@/lib/date-format'
import { DateFormatProvider } from '@/components/providers/DateFormatProvider'
import '@/styles/globals.css'

const display = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
})

const body = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

// Optional typefaces organizers can pick for their event page.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
})
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

const fontVars = [display, body, inter, roboto, dmSans, poppins, jakarta]
  .map((f) => f.variable)
  .join(' ')

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
    <html lang={locale} dir="ltr" data-theme={theme} className={fontVars}>
      <body>
        <NextIntlClientProvider>
          <DateFormatProvider value={dateFmtPrefs}>{children}</DateFormatProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
