import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { Unbounded, IBM_Plex_Sans } from 'next/font/google'
import { routing } from '@/lib/i18n/routing'
import { THEME_COOKIE } from '@/lib/theme'
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
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value
  const theme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined

  return (
    <html
      lang={locale}
      dir="ltr"
      data-theme={theme}
      className={`${display.variable} ${body.variable}`}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
