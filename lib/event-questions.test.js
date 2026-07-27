import { describe, it, expect } from 'vitest'
import { eventQuestionBuckets, eventQuestionColumns, versionBucket } from './event-questions.js'

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
    })
  })
})
