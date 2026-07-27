import { describe, it, expect } from 'vitest'
import { eventQuestionColumns } from './event-questions.js'

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
