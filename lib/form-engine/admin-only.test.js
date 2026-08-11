import { describe, expect, test } from 'vitest'
import { visibleQuestions, preserveAdminAnswers } from './visibility'
import { validateParticipantAnswers } from './validate'
import { normalizeQuestionPatch } from '@/components/form-builder/QuestionInspector'

const DEFINITION = {
  questions: [
    { id: 'q_diet', type: 'text', label: { en: 'Dietary needs' } },
    { id: 'q_notes', type: 'text', label: { en: 'Staff notes' }, adminOnly: true },
    {
      id: 'q_followup',
      type: 'text',
      label: { en: 'Follow-up' },
      // A rule watching an admin-only question: the registrant sees undefined.
      visibleIf: { op: 'and', rules: [{ questionId: 'q_notes', operator: 'isNotEmpty' }] },
    },
  ],
}

describe('admin-only questions', () => {
  test('are hidden from registrants and shown to organizers', () => {
    const asRegistrant = visibleQuestions(DEFINITION, 'student', {}).map((q) => q.id)
    expect(asRegistrant).not.toContain('q_notes')
    expect(asRegistrant).toContain('q_diet')

    const asAdmin = visibleQuestions(DEFINITION, 'student', {}, { audience: 'admin' }).map(
      (q) => q.id
    )
    expect(asAdmin).toContain('q_notes')
  })

  test('a crafted registrant payload cannot set one', () => {
    // This is the /api/register enforcement point: the route validates with
    // the default audience, so the answer is pruned before it reaches the RPC.
    const { cleaned } = validateParticipantAnswers(DEFINITION, 'student', {
      q_diet: 'none',
      q_notes: 'injected by a crafted POST',
    })
    expect(cleaned).toEqual({ q_diet: 'none' })
  })

  test('an organizer can set one', () => {
    const { cleaned } = validateParticipantAnswers(
      DEFINITION,
      'student',
      { q_diet: 'none', q_notes: 'cabin 4' },
      { audience: 'admin' }
    )
    expect(cleaned).toEqual({ q_diet: 'none', q_notes: 'cabin 4' })
  })

  test('an admin-only ANSWER still drives conditional logic for registrants', () => {
    // Hiding is about which questions are *asked*, not about blanking values:
    // rules evaluate against the stored answers map either way. So an
    // organizer can flag a participant in a private field and thereby reveal a
    // follow-up question to them — deliberate, and the only self-consistent
    // option, since FormRenderer and validateParticipantAnswers evaluate the
    // same rules over the same answers. The registrant can infer only that the
    // private field is non-empty, and only when an organizer wrote such a rule.
    const ids = visibleQuestions(DEFINITION, 'student', { q_notes: 'VIP' }).map((q) => q.id)
    expect(ids).toContain('q_followup')
    expect(ids).not.toContain('q_notes')

    // With the flag unset, the follow-up stays hidden.
    expect(visibleQuestions(DEFINITION, 'student', {}).map((q) => q.id)).not.toContain(
      'q_followup'
    )
  })

  test('an admin-only question is never required for a registrant either', () => {
    const def = {
      questions: [{ id: 'q_notes', type: 'text', adminOnly: true, required: true }],
    }
    // Would otherwise be an unfillable required field on the public form.
    expect(validateParticipantAnswers(def, 'student', {}).valid).toBe(true)
  })
})

describe('preserveAdminAnswers', () => {
  test('carries stored organizer answers across a self-service edit', () => {
    // update_own_participant overwrites `answers` wholesale, so without this
    // the registrant's edit erases the organizer's notes.
    const merged = preserveAdminAnswers(
      DEFINITION,
      'student',
      { q_diet: 'vegan', q_notes: 'cabin 4' },
      { q_diet: 'none' }
    )
    expect(merged).toEqual({ q_diet: 'none', q_notes: 'cabin 4' })
  })

  test('adds nothing when the organizer never filled one in', () => {
    expect(preserveAdminAnswers(DEFINITION, 'student', { q_diet: 'vegan' }, { q_diet: 'none' })).toEqual(
      { q_diet: 'none' }
    )
  })

  test('does not resurrect an answer the registrant legitimately cleared', () => {
    expect(preserveAdminAnswers(DEFINITION, 'student', { q_diet: 'vegan' }, {})).toEqual({})
  })
})

describe('normalizeQuestionPatch', () => {
  test('turning admin-only on clears required', () => {
    expect(normalizeQuestionPatch({ adminOnly: true }, { required: true })).toEqual({
      adminOnly: true,
      required: false,
    })
  })

  test('leaves an ordinary patch alone', () => {
    expect(normalizeQuestionPatch({ required: true }, {})).toEqual({ required: true })
  })
})
