import { describe, expect, test } from 'vitest'
import { eventPhase, EVENT_PHASE_TONES } from './event-phase'

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
