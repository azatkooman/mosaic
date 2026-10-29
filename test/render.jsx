import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'

// Shared by the jsdom component tests: real English messages rather than a
// stubbed t(), so a renamed key fails here the same way it would on screen.
export function Intl({ children, locale = 'en' }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  )
}
