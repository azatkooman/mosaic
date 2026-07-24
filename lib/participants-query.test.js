import { describe, it, expect } from 'vitest'
import { applyParticipantFilters, applyParticipantSort } from './participants-query.js'

// Minimal PostgREST-builder stub that records the chained calls.
function mockQuery() {
  const calls = []
  const q = new Proxy(
    {},
    {
      get(_t, prop) {
        return (...args) => {
          calls.push([prop, ...args])
          return q
        }
      },
    }
  )
  return { q, calls }
}

const QUESTIONS = [
  { id: 'q_sel', type: 'select' },
  { id: 'q_ms', type: 'multiselect' },
  { id: 'q_chk', type: 'checkbox' },
  { id: 'q_txt', type: 'text' },
]

describe('applyParticipantFilters', () => {
  it('applies status + type as equality', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: 'confirmed', typeId: 'T1' }, QUESTIONS)
    expect(calls).toContainEqual(['eq', 'status', 'confirmed'])
    expect(calls).toContainEqual(['eq', 'participant_type_id', 'T1'])
  })

  it('sanitizes search (strips parens/commas) into an or() of name+email', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: '  Smith (guest), x ' }, QUESTIONS)
    const or = calls.find((c) => c[0] === 'or')
    expect(or[1]).toBe('first_name.ilike.%Smith guest x%,last_name.ilike.%Smith guest x%,email.ilike.%Smith guest x%')
  })

  it('branches answer filters by question type', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(
      q,
      { answerFilters: { q_sel: 'a', q_ms: 'b', q_chk: 'true', q_txt: 'hi' } },
      QUESTIONS
    )
    expect(calls).toContainEqual(['eq', 'answers->>q_sel', 'a'])
    expect(calls).toContainEqual(['contains', 'answers', { q_ms: ['b'] }])
    expect(calls).toContainEqual(['contains', 'answers', { q_chk: true }])
    expect(calls).toContainEqual(['ilike', 'answers->>q_txt', '%hi%'])
  })

  it('IGNORES answer filters whose question id is unknown (export-URL guard)', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { 'evil)=;drop': 'x' } }, QUESTIONS)
    expect(calls.length).toBe(0)
  })

  it('skips empty/null filter values', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: '', answerFilters: { q_txt: '' } }, QUESTIONS)
    expect(calls.length).toBe(0)
  })
})

describe('applyParticipantSort', () => {
  it('maps known columns and always adds an id tiebreaker', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: 'first_name', dir: 'asc' }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'first_name', { ascending: true }])
    expect(calls[1]).toEqual(['order', 'id', { ascending: true }])
  })

  it('type sorts by participant_type_id; desc respected', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: 'type', dir: 'desc' }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'participant_type_id', { ascending: false }])
  })

  it('answer-column sort (q:<id>) orders by the json path when the id is known', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: 'q:q_txt', dir: 'asc' }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'answers->>q_txt', { ascending: true }])
  })

  it('unknown answer id falls back to the default (created_at desc), not the raw path', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: 'q:nope', dir: 'asc' }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'created_at', { ascending: false }])
  })

  it('no column → default newest first', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: null }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'created_at', { ascending: false }])
    expect(calls[1]).toEqual(['order', 'id', { ascending: true }])
  })
})
