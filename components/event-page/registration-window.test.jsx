import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'
import { EventPageView } from './EventPageView'

const NOW = Date.parse('2026-06-01T12:00:00Z')
const HOUR = 3600_000
const iso = (offset) => new Date(NOW + offset).toISOString()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

function page(dates) {
  const event = {
    id: 'e1',
    slug: 'demo',
    default_locale: 'en',
    timezone: 'UTC',
    name: { en: 'Demo' },
    page_content: {},
    ...dates,
  }
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <EventPageView event={event} locale="en" registerHref="/en/events/demo/register" />
    </NextIntlClientProvider>
  )
}

const CLOSED = messages.event.registrationClosed
const NOT_OPEN = messages.event.registrationNotOpen.split('{')[0]
const registerLink = (html) => html.includes('href="/en/events/demo/register"')

describe('EventPageView registration window (read at render time)', () => {
  it('offers the register button with no dates set', () => {
    const html = page({})
    expect(registerLink(html)).toBe(true)
    expect(html).not.toContain(CLOSED)
  })

  it('says registration has not opened before the opening time', () => {
    const html = page({ registration_opens_at: iso(HOUR) })
    expect(html).toContain(NOT_OPEN)
    expect(registerLink(html)).toBe(false)
  })

  it('opens exactly at the opening time', () => {
    const html = page({ registration_opens_at: iso(0) })
    expect(html).not.toContain(NOT_OPEN)
    expect(registerLink(html)).toBe(true)
  })

  it('stays open through the closing instant, then closes', () => {
    expect(page({ registration_closes_at: iso(0) })).not.toContain(CLOSED)
    const html = page({ registration_closes_at: iso(-1) })
    expect(html).toContain(CLOSED)
    expect(registerLink(html)).toBe(false)
  })

  it('is closed by the organizer switch regardless of the dates', () => {
    const html = page({
      registration_opens_at: iso(-HOUR),
      registration_closes_at: iso(HOUR),
      registration_manually_closed: true,
    })
    expect(html).toContain(CLOSED)
  })

  it('prefers "closed" over "not open yet" when both apply', () => {
    const html = page({ registration_opens_at: iso(HOUR), registration_manually_closed: true })
    expect(html).toContain(CLOSED)
    expect(html).not.toContain(NOT_OPEN)
  })
})
