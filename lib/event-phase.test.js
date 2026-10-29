import { describe, expect, test } from 'vitest'
import { eventPhase, registrationWindow, EVENT_PHASE_TONES } from './event-phase'

const DAY = 86400_000
const NOW = Date.parse('2026-06-15T12:00:00Z')
const iso = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString()

/** An event whose registration window is open and whose dates are in the future. */
const openEvent = {
  registration_opens_at: iso(-2),
  registration_closes_at: iso(10),
  starts_at: iso(20),
  ends_at: iso(22),
}

describe('eventPhase', () => {
  test('derives the phase from the dates', () => {
    expect(eventPhase(openEvent, NOW)).toBe('registrationOpen')
    expect(eventPhase({ ...openEvent, registration_opens_at: iso(2) }, NOW)).toBe(
      'registrationNotOpen'
    )
    expect(eventPhase({ ...openEvent, registration_closes_at: iso(-1) }, NOW)).toBe(
      'registrationClosed'
    )
    expect(eventPhase({ ...openEvent, starts_at: iso(-1) }, NOW)).toBe('inProgress')
    expect(eventPhase({ ...openEvent, starts_at: iso(-5), ends_at: iso(-3) }, NOW)).toBe('ended')
  })

  test('the manual switch closes an otherwise-open window', () => {
    expect(eventPhase({ ...openEvent, registration_manually_closed: true }, NOW)).toBe(
      'registrationClosed'
    )
    // Explicitly false must behave exactly like an absent column, so rows
    // written before the migration read the same as rows written after it.
    expect(eventPhase({ ...openEvent, registration_manually_closed: false }, NOW)).toBe(
      'registrationOpen'
    )
  })

  test('the manual switch does not override the event actually running or being over', () => {
    // "Closed" would be misleading once the event itself has started or ended.
    expect(
      eventPhase({ ...openEvent, starts_at: iso(-1), registration_manually_closed: true }, NOW)
    ).toBe('inProgress')
    expect(
      eventPhase(
        { ...openEvent, starts_at: iso(-5), ends_at: iso(-3), registration_manually_closed: true },
        NOW
      )
    ).toBe('ended')
  })

  test('every phase has a badge tone', () => {
    for (const phase of [
      'registrationNotOpen',
      'registrationOpen',
      'registrationClosed',
      'inProgress',
      'ended',
    ]) {
      expect(EVENT_PHASE_TONES[phase]).toBeTruthy()
    }
  })
})

describe('registrationWindow', () => {
  const now = Date.parse('2026-06-01T12:00:00Z')
  const at = (offset) => new Date(now + offset).toISOString()

  test('open with no dates and no switch', () => {
    expect(registrationWindow({}, now)).toEqual({ notOpenYet: false, closed: false })
  })

  test('not open yet before the opening instant, open at it', () => {
    expect(registrationWindow({ registration_opens_at: at(1) }, now).notOpenYet).toBe(true)
    expect(registrationWindow({ registration_opens_at: at(0) }, now).notOpenYet).toBe(false)
  })

  test('open through the closing instant, closed after it', () => {
    expect(registrationWindow({ registration_closes_at: at(0) }, now).closed).toBe(false)
    expect(registrationWindow({ registration_closes_at: at(-1) }, now).closed).toBe(true)
  })

  test('the manual switch closes it whatever the dates say', () => {
    const event = {
      registration_opens_at: at(-1000),
      registration_closes_at: at(1000),
      registration_manually_closed: true,
    }
    expect(registrationWindow(event, now)).toEqual({ notOpenYet: false, closed: true })
  })

  test('ignores the event dates, which only eventPhase reads', () => {
    expect(registrationWindow({ starts_at: at(-1000), ends_at: at(-1) }, now).closed).toBe(false)
  })
})
