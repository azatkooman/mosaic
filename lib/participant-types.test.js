import { describe, expect, test } from 'vitest'
import { resolvePreselectedType, visibleParticipantTypes } from './participant-types'

const TYPES = [
  { id: 'id-student', key: 'student', min_per_registration: 0 },
  { id: 'id-staff', key: 'staff', hidden: true, min_per_registration: 0 },
  { id: 'id-couple', key: 'couple', min_per_registration: 2 },
]

describe('resolvePreselectedType', () => {
  test('matches on key, and falls back to id so a renamed key still resolves', () => {
    expect(resolvePreselectedType(TYPES, 'student')).toBe('student')
    expect(resolvePreselectedType(TYPES, 'id-staff')).toBe('staff')
  })

  test('resolves a hidden type — that is what its private link is for', () => {
    expect(resolvePreselectedType(TYPES, 'staff')).toBe('staff')
  })

  test('refuses a type that needs more than one participant', () => {
    // The deep link opens a single registration, which submit_registration
    // would reject with 'too few participants of type %'.
    expect(resolvePreselectedType(TYPES, 'couple')).toBeNull()
  })

  test('a stale or absent link degrades to the ordinary form', () => {
    expect(resolvePreselectedType(TYPES, 'deleted-type')).toBeNull()
    expect(resolvePreselectedType(TYPES, '')).toBeNull()
    expect(resolvePreselectedType(TYPES, undefined)).toBeNull()
    expect(resolvePreselectedType(TYPES, ['staff'])).toBeNull()
  })
})

describe('visibleParticipantTypes', () => {
  test('omits hidden types from the public list', () => {
    expect(visibleParticipantTypes(TYPES).map((t) => t.key)).toEqual(['student', 'couple'])
  })

  test('includes the hidden type that was deep-linked, and only that one', () => {
    const shown = visibleParticipantTypes(
      [...TYPES, { id: 'id-vip', key: 'vip', hidden: true }],
      'staff'
    )
    expect(shown.map((t) => t.key)).toEqual(['student', 'staff', 'couple'])
  })

  test('can return nothing when every type is hidden', () => {
    // The register page renders an invitation-only notice for this case
    // rather than a mode step with no options.
    expect(visibleParticipantTypes([{ key: 'staff', hidden: true }])).toEqual([])
  })
})
