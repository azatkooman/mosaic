import { describe, it, expect } from 'vitest'
import {
  eventQuestionBuckets,
  eventQuestionColumns,
  questionFormTitles,
  questionHeaders,
  versionBucket,
} from './event-questions.js'

// Mirrors the real shape: form_versions rows joined to their form's
// current_version_id, in the arbitrary order PostgREST returns them.
const v = (id, currentId, questions) => ({
  id,
  forms: { current_version_id: currentId },
  definition: { questions },
})

describe('eventQuestionColumns', () => {
  it('ignores questions that only exist in superseded versions', () => {
    // The ewrfgbv case: v1 asked name+email, v4 (current) does not.
    const versions = [
      v('v4', 'v4', [
        { id: 'q_text', type: 'text', label: { en: 'Short text' } },
        { id: 'q_mail', type: 'email', label: { en: 'Email' } },
      ]),
      v('v1', 'v4', [
        { id: 'q_old_name', type: 'name', label: { en: 'Name' } },
        { id: 'q_old_mail', type: 'email', label: { en: 'Email' } },
      ]),
    ]
    expect(eventQuestionColumns(versions).map((q) => q.id)).toEqual(['q_text', 'q_mail'])
  })

  it('takes the label from the current version, not whichever came first', () => {
    const versions = [
      v('v1', 'v7', [{ id: 'q_sel', type: 'select', label: { en: 'Dropdown' } }]),
      v('v7', 'v7', [{ id: 'q_sel', type: 'select', label: { en: 'Choose your option' } }]),
    ]
    const [q] = eventQuestionColumns(versions)
    expect(q.label.en).toBe('Choose your option')
  })

  it('unions the current versions of every form on the event', () => {
    // single-mode form + family-mode form each contribute their own columns.
    const versions = [
      v('s2', 's2', [{ id: 'q_a', type: 'text' }]),
      v('f3', 'f3', [{ id: 'q_b', type: 'text' }]),
      v('f1', 'f3', [{ id: 'q_dead', type: 'text' }]),
    ]
    expect(eventQuestionColumns(versions).map((q) => q.id)).toEqual(['q_a', 'q_b'])
  })

  it('drops sections and archived questions', () => {
    const versions = [
      v('v1', 'v1', [
        { id: 'sec', type: 'section' },
        { id: 'q_gone', type: 'text', archived: true },
        { id: 'q_ok', type: 'text' },
      ]),
    ]
    expect(eventQuestionColumns(versions).map((q) => q.id)).toEqual(['q_ok'])
  })

  it('deduplicates a question shared by two forms', () => {
    const versions = [
      v('s1', 's1', [{ id: 'q_name', type: 'name' }]),
      v('f1', 'f1', [{ id: 'q_name', type: 'name' }]),
    ]
    expect(eventQuestionColumns(versions)).toHaveLength(1)
  })

  it('returns nothing when no version is current, rather than falling back', () => {
    expect(eventQuestionColumns([v('v1', null, [{ id: 'q', type: 'text' }])])).toEqual([])
    expect(eventQuestionColumns()).toEqual([])
  })
})

// Same shape again, plus the form's registration_mode: 'family' is a group
// registration, 'single' and null (per-type / Default form) are individual.
const mv = (id, currentId, mode, questions) => ({
  id,
  forms: { current_version_id: currentId, registration_mode: mode },
  definition: { questions },
})

describe('versionBucket', () => {
  it('treats only family-mode forms as group registrations', () => {
    expect(versionBucket(mv('v', 'v', 'family', []))).toBe('group')
    expect(versionBucket(mv('v', 'v', 'single', []))).toBe('individual')
    expect(versionBucket(mv('v', 'v', null, []))).toBe('individual')
    expect(versionBucket(undefined)).toBe('individual')
  })
})

describe('eventQuestionBuckets', () => {
  const versions = [
    mv('s2', 's2', 'single', [
      { id: 'q_solo_name', type: 'name', label: { en: 'Your name' } },
      { id: 'q_solo_diet', type: 'text', label: { en: 'Dietary needs' } },
    ]),
    mv('f3', 'f3', 'family', [
      { id: 'q_grp_lead', type: 'name', label: { en: 'Group leader' } },
      { id: 'q_grp_rooms', type: 'number', label: { en: 'Rooms needed' } },
    ]),
    // A superseded family version: no columns, but its rows are still group rows.
    mv('f1', 'f3', 'family', [{ id: 'q_grp_dead', type: 'text', label: { en: 'Gone' } }]),
  ]

  it('gives each bucket only its own forms’ questions', () => {
    const { individual, group } = eventQuestionBuckets(versions)
    expect(individual.questions.map((q) => q.id)).toEqual(['q_solo_name', 'q_solo_diet'])
    expect(group.questions.map((q) => q.id)).toEqual(['q_grp_lead', 'q_grp_rooms'])
  })

  it('shares no answer column between the two tables', () => {
    const { individual, group } = eventQuestionBuckets(versions)
    const ids = new Set(individual.questions.map((q) => q.id))
    expect(group.questions.some((q) => ids.has(q.id))).toBe(false)
  })

  it('scopes rows by EVERY version of the bucket’s forms, not just the current one', () => {
    // A participant who answered the superseded f1 is still a group row.
    const { individual, group } = eventQuestionBuckets(versions)
    expect(group.versionIds.sort()).toEqual(['f1', 'f3'])
    expect(individual.versionIds).toEqual(['s2'])
  })

  it('partitions every version, so no participant falls out of both tables', () => {
    const { individual, group } = eventQuestionBuckets(versions)
    expect([...individual.versionIds, ...group.versionIds].sort()).toEqual(['f1', 'f3', 's2'])
  })

  it('puts per-type and Default forms in the individual list', () => {
    const { individual, group } = eventQuestionBuckets([
      mv('d1', 'd1', null, [{ id: 'q_a', type: 'text' }]),
    ])
    expect(individual.questions.map((q) => q.id)).toEqual(['q_a'])
    expect(group.questions).toEqual([])
    expect(group.versionIds).toEqual([])
  })

  it('returns empty buckets for an event with no forms', () => {
    expect(eventQuestionBuckets()).toEqual({
      individual: { questions: [], versionIds: [] },
      group: { questions: [], versionIds: [] },
      all: { questions: [], versionIds: [] },
    })
  })
})

describe('eventQuestionBuckets — the merged All list', () => {
  it('merges a question the two forms share into one column', () => {
    // The i-go-tech-track shape: the group form was cloned from the single
    // form, so both ask q_name under the same id. Doubling it would give the
    // All table two identical columns, one always empty.
    const { all } = eventQuestionBuckets([
      mv('s1', 's1', 'single', [{ id: 'q_name', type: 'text', label: { en: 'Name' } }]),
      mv('g1', 'g1', 'family', [{ id: 'q_name', type: 'text', label: { en: 'Name' } }]),
    ])
    expect(all.questions.map((q) => q.id)).toEqual(['q_name'])
  })

  it('keeps a question only one form asks', () => {
    // thai-ccci: the group form asks nine things the single form does not.
    const { all } = eventQuestionBuckets([
      mv('s1', 's1', 'single', [{ id: 'q_name', type: 'text' }]),
      mv('g1', 'g1', 'family', [{ id: 'q_name', type: 'text' }, { id: 'q_flight', type: 'text' }]),
    ])
    expect(all.questions.map((q) => q.id)).toEqual(['q_name', 'q_flight'])
  })

  it('orders individual columns first, then group-only ones', () => {
    const { all } = eventQuestionBuckets([
      mv('g1', 'g1', 'family', [{ id: 'q_room', type: 'text' }]),
      mv('s1', 's1', 'single', [{ id: 'q_name', type: 'text' }]),
    ])
    expect(all.questions.map((q) => q.id)).toEqual(['q_name', 'q_room'])
  })

  it('spans every version of both lists, so no participant is missing', () => {
    const { all } = eventQuestionBuckets([
      mv('s1', 's2', 'single', [{ id: 'q_a', type: 'text' }]),
      mv('s2', 's2', 'single', [{ id: 'q_a', type: 'text' }]),
      mv('g1', 'g1', 'family', [{ id: 'q_b', type: 'text' }]),
    ])
    expect(all.versionIds.sort()).toEqual(['g1', 's1', 's2'])
  })

  it('still excludes superseded and archived questions', () => {
    const { all } = eventQuestionBuckets([
      mv('s1', 's2', 'single', [{ id: 'q_old', type: 'text' }]),
      mv('s2', 's2', 'single', [{ id: 'q_new', type: 'text' }]),
      mv('g1', 'g1', 'family', [{ id: 'q_gone', type: 'text', archived: true }]),
    ])
    expect(all.questions.map((q) => q.id)).toEqual(['q_new'])
  })
})

describe('questionHeaders', () => {
  const en = (q) => q.label?.en ?? ''
  const titles = new Map([['q_a', 'Default form'], ['q_b', 'Single response form']])

  it('qualifies colliding labels with the form that asks them', () => {
    // tech-conference-2026: two forms each define their own "Email" under a
    // different id, so the merged list would show two columns headed "Email".
    const qs = [
      { id: 'q_a', label: { en: 'Email' } },
      { id: 'q_b', label: { en: 'Email' } },
    ]
    expect(questionHeaders(qs, titles, en)).toEqual([
      'Email (Default form)',
      'Email (Single response form)',
    ])
  })

  it('leaves an unambiguous label alone', () => {
    // Otherwise all nine of i-go-tech-track's columns carry a form name that
    // distinguishes nothing.
    const qs = [{ id: 'q_a', label: { en: 'Name' } }, { id: 'q_b', label: { en: 'Email' } }]
    expect(questionHeaders(qs, titles, en)).toEqual(['Name', 'Email'])
  })

  it('accepts the plain object the console gets across the server boundary', () => {
    const qs = [{ id: 'q_a', label: { en: 'Email' } }, { id: 'q_b', label: { en: 'Email' } }]
    const asObject = { q_a: 'Default form', q_b: 'Single response form' }
    expect(questionHeaders(qs, asObject, en)).toEqual([
      'Email (Default form)',
      'Email (Single response form)',
    ])
  })

  it('falls back to the question id when a label is missing entirely', () => {
    expect(questionHeaders([{ id: 'q_z', label: {} }], titles, en)).toEqual(['q_z'])
  })

  it('leaves a collision unqualified when the form title is unknown', () => {
    // Better a duplicate header than "Email (undefined)".
    const qs = [{ id: 'q_x', label: { en: 'Email' } }, { id: 'q_y', label: { en: 'Email' } }]
    expect(questionHeaders(qs, new Map(), en)).toEqual(['Email', 'Email'])
  })
})

describe('questionFormTitles', () => {
  const tv = (id, currentId, title, questions) => ({
    id,
    forms: { current_version_id: currentId, title },
    definition: { questions },
  })

  it('maps each question to the form that asks it', () => {
    const map = questionFormTitles([
      tv('v1', 'v1', 'Default form', [{ id: 'q_a', type: 'text' }]),
      tv('v2', 'v2', 'Single response form', [{ id: 'q_b', type: 'text' }]),
    ])
    expect(map.get('q_a')).toBe('Default form')
    expect(map.get('q_b')).toBe('Single response form')
  })

  it('ignores superseded versions, matching the column list', () => {
    const map = questionFormTitles([tv('v1', 'v2', 'Old form', [{ id: 'q_a', type: 'text' }])])
    expect(map.has('q_a')).toBe(false)
  })
})
