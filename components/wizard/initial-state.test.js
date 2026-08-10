import { describe, expect, test } from 'vitest'
import { initialWizardState, draftWinsOverLink } from './initial-state'

const TYPES = [
  { key: 'student', definition: { questions: [] } },
  { key: 'staff', definition: { questions: [] } },
]

describe('initialWizardState', () => {
  test('without a link, opens on the mode step with nothing chosen', () => {
    const s = initialWizardState({ participantTypes: TYPES })
    expect(s).toMatchObject({ step: 'mode', mode: null, singleTypeKey: null, people: [] })
    expect(s.counts).toEqual({ student: 0, staff: 0 })
  })

  test('a link opens straight on that type’s form as a single registration', () => {
    const s = initialWizardState({ participantTypes: TYPES, preselectedTypeKey: 'staff' })
    expect(s).toMatchObject({ step: 'person', mode: 'single', singleTypeKey: 'staff' })
    expect(s.counts).toEqual({ student: 0, staff: 1 })
    expect(s.people).toHaveLength(1)
    expect(s.people[0].participantTypeKey).toBe('staff')
  })

  test('a link naming a type this event does not offer falls back to the mode step', () => {
    const s = initialWizardState({ participantTypes: TYPES, preselectedTypeKey: 'ghost' })
    expect(s.step).toBe('mode')
  })

  test('prefills identity answers from the profile', () => {
    const withName = [
      {
        key: 'student',
        definition: {
          questions: [{ id: 'q_name', type: 'name', label: { en: 'Name' }, required: true }],
        },
      },
    ]
    const s = initialWizardState({
      participantTypes: withName,
      preselectedTypeKey: 'student',
      profile: { full_name: 'Ada Lovelace', email: 'ada@example.org' },
    })
    expect(s.people[0].answers).not.toEqual({})
  })

  test('a single-mode form overrides the type’s own form for the seeded person', () => {
    const s = initialWizardState({
      participantTypes: [{ key: 'student', definition: null }],
      preselectedTypeKey: 'student',
      modeForms: { single: { questions: [] } },
    })
    // Would have thrown on a null definition without the mode-form fallback.
    expect(s.people[0].participantTypeKey).toBe('student')
  })
})

describe('draftWinsOverLink', () => {
  test('with no link, any usable draft is restored', () => {
    expect(draftWinsOverLink({ singleTypeKey: 'student' }, null)).toBe(true)
    expect(draftWinsOverLink(null, null)).toBe(true)
  })

  test('a draft for the same type is the reader’s own half-finished form', () => {
    expect(draftWinsOverLink({ singleTypeKey: 'staff' }, 'staff')).toBe(true)
  })

  test('a draft for a different type is stale and the link wins', () => {
    expect(draftWinsOverLink({ singleTypeKey: 'student' }, 'staff')).toBe(false)
    expect(draftWinsOverLink({}, 'staff')).toBe(false)
  })
})
