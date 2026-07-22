import { describe, it, expect } from 'vitest'
import {
  formatEventDate,
  formatEventDateRange,
  formatSampleDate,
  formatSampleTime,
} from './dates.js'
import {
  normalizeDateFormat,
  normalizeTimeFormat,
  parseDateFmtCookie,
  serializeDateFmtCookie,
} from './date-format.js'

const ISO = '2026-12-31T14:30:00Z' // Thursday, Dec 31 2026, 14:30 UTC
const LOCALES = ['en', 'es', 'fr', 'ru', 'uk']

describe('formatEventDate — forced date orders', () => {
  it.each(LOCALES)('dmy/mdy/ymd render the same digits in %s', (locale) => {
    expect(formatEventDate(ISO, 'UTC', locale, { dateFormat: 'dmy', timeFormat: 'h24' }))
      .toBe('31/12/2026, 14:30')
    expect(formatEventDate(ISO, 'UTC', locale, { dateFormat: 'mdy', timeFormat: 'h24' }))
      .toBe('12/31/2026, 14:30')
    expect(formatEventDate(ISO, 'UTC', locale, { dateFormat: 'ymd', timeFormat: 'h24' }))
      .toBe('2026-12-31, 14:30')
  })

  it('respects the event timezone', () => {
    // 14:30 UTC = 09:30 in New York (EST, winter)
    expect(
      formatEventDate(ISO, 'America/New_York', 'en', { dateFormat: 'ymd', timeFormat: 'h24' })
    ).toBe('2026-12-31, 09:30')
  })

  it('h12 keeps the day-period in the user language', () => {
    const en = formatEventDate(ISO, 'UTC', 'en', { dateFormat: 'dmy', timeFormat: 'h12' })
    expect(en).toBe('31/12/2026, 2:30 PM')
    const uk = formatEventDate(ISO, 'UTC', 'uk', { dateFormat: 'dmy', timeFormat: 'h12' })
    expect(uk.startsWith('31/12/2026, 2:30')).toBe(true)
    expect(uk).not.toMatch(/PM/) // localized, e.g. «пп»
  })

  it('midnight renders 12:05 AM in h12 and 00:05 in h24', () => {
    const midnight = '2026-12-31T00:05:00Z'
    expect(formatEventDate(midnight, 'UTC', 'en', { dateFormat: 'ymd', timeFormat: 'h12' }))
      .toBe('2026-12-31, 12:05 AM')
    expect(formatEventDate(midnight, 'UTC', 'en', { dateFormat: 'ymd', timeFormat: 'h24' }))
      .toBe('2026-12-31, 00:05')
  })

  it('auto date + forced clock tweaks only the time', () => {
    const h24 = formatEventDate(ISO, 'UTC', 'en', { timeFormat: 'h24' })
    expect(h24).toContain('December 31, 2026')
    expect(h24).toContain('14:30')
    const h12 = formatEventDate(ISO, 'UTC', 'ru', { timeFormat: 'h12' })
    expect(h12).toMatch(/2:30/)
  })

  it('auto/auto is unchanged legacy behaviour', () => {
    expect(formatEventDate(ISO, 'UTC', 'en')).toBe(
      formatEventDate(ISO, 'UTC', 'en', { dateFormat: 'auto', timeFormat: 'auto' })
    )
  })

  it('bad timezone still returns a formatted string, not a throw', () => {
    const out = formatEventDate(ISO, 'Not/AZone', 'en', { dateFormat: 'dmy', timeFormat: 'h24' })
    expect(out).toBe('31/12/2026, 14:30') // UTC fallback
  })
})

describe('formatEventDateRange — forced orders', () => {
  const END = '2027-01-02T10:00:00Z'

  it('renders both full dates with an en dash', () => {
    expect(formatEventDateRange(ISO, END, 'UTC', 'en', { dateFormat: 'dmy' }))
      .toBe('31/12/2026 – 02/01/2027')
    expect(formatEventDateRange(ISO, END, 'UTC', 'ru', { dateFormat: 'ymd' }))
      .toBe('2026-12-31 – 2027-01-02')
  })

  it('collapses same-day ranges to one date (in the event timezone)', () => {
    const sameDayEnd = '2026-12-31T20:00:00Z'
    expect(formatEventDateRange(ISO, sameDayEnd, 'UTC', 'en', { dateFormat: 'mdy' }))
      .toBe('12/31/2026')
  })

  it('null end renders the single date', () => {
    expect(formatEventDateRange(ISO, null, 'UTC', 'en', { dateFormat: 'ymd' }))
      .toBe('2026-12-31')
  })

  it('auto stays on Intl.formatRange', () => {
    const out = formatEventDateRange(ISO, END, 'UTC', 'en')
    expect(out).toContain('2026')
    expect(out).toContain('2027')
  })
})

describe('sample previews', () => {
  it('formatSampleDate matches the forced layouts', () => {
    expect(formatSampleDate('dmy', 'en')).toBe('31/12/2026')
    expect(formatSampleDate('mdy', 'uk')).toBe('12/31/2026')
    expect(formatSampleDate('ymd', 'fr')).toBe('2026-12-31')
    expect(formatSampleDate('auto', 'en')).toContain('2026')
  })

  it('formatSampleTime matches the forced clocks', () => {
    expect(formatSampleTime('h24', 'en')).toBe('14:30')
    expect(formatSampleTime('h12', 'en')).toBe('2:30 PM')
    expect(formatSampleTime('auto', 'ru')).toContain('14:30')
  })
})

describe('date-format cookie model', () => {
  it('normalizes garbage to auto', () => {
    expect(normalizeDateFormat('nonsense')).toBe('auto')
    expect(normalizeTimeFormat(42)).toBe('auto')
    expect(parseDateFmtCookie('zzz')).toEqual({ dateFormat: 'auto', timeFormat: 'auto' })
    expect(parseDateFmtCookie(undefined)).toEqual({ dateFormat: 'auto', timeFormat: 'auto' })
  })

  it('round-trips valid prefs', () => {
    const prefs = { dateFormat: 'dmy', timeFormat: 'h24' }
    expect(parseDateFmtCookie(serializeDateFmtCookie(prefs))).toEqual(prefs)
  })

  it('serializes both-auto to null (cookie cleared)', () => {
    expect(serializeDateFmtCookie({ dateFormat: 'auto', timeFormat: 'auto' })).toBe(null)
    expect(serializeDateFmtCookie({})).toBe(null)
  })

  it('partial overrides keep the other side auto', () => {
    expect(parseDateFmtCookie('dmy.auto')).toEqual({ dateFormat: 'dmy', timeFormat: 'auto' })
    expect(parseDateFmtCookie('auto.h12')).toEqual({ dateFormat: 'auto', timeFormat: 'h12' })
  })
})
