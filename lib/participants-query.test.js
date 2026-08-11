import { describe, it, expect } from 'vitest'
import {
  applyParticipantFilters,
  applyParticipantSort,
  parseStatusFilter,
  parseTypeFilter,
} from './participants-query.js'

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'

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
  it('scopes rows to one registration bucket by form version', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { formVersionIds: ['f1', 'f3'] }, QUESTIONS)
    expect(calls).toContainEqual(['in', 'form_version_id', ['f1', 'f3']])
  })

  it('returns nothing for an empty bucket rather than everything', () => {
    // An event with no group form must show an empty group table, not the
    // whole participant list.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { formVersionIds: [] }, QUESTIONS)
    expect(calls).toContainEqual(['in', 'form_version_id', []])
  })

  it('leaves the list unscoped when no bucket is given', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: 'confirmed' }, QUESTIONS)
    expect(calls.some((c) => c[0] === 'in' && c[1] === 'form_version_id')).toBe(false)
  })

  it('applies a lone status + type as equality', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: 'confirmed', typeId: T1 }, QUESTIONS)
    expect(calls).toContainEqual(['eq', 'status', 'confirmed'])
    expect(calls).toContainEqual(['eq', 'participant_type_id', T1])
  })

  it('matches several participant types at once', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { typeId: [T1, T2] }, QUESTIONS)
    expect(calls).toContainEqual(['in', 'participant_type_id', [T1, T2]])
  })

  it('reads a comma-separated typeId from an export URL', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { typeId: `${T1},${T2}` }, QUESTIONS)
    expect(calls).toContainEqual(['in', 'participant_type_id', [T1, T2]])
  })

  it('drops a malformed type id rather than erroring the uuid comparison', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { typeId: `${T1},not-a-uuid` }, QUESTIONS)
    expect(calls).toContainEqual(['eq', 'participant_type_id', T1])
  })

  it('matches several statuses at once', () => {
    // The case the single-select could not express: everything except the
    // confirmed participants.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: ['waitlisted', 'cancelled'] }, QUESTIONS)
    expect(calls).toContainEqual(['in', 'status', ['waitlisted', 'cancelled']])
  })

  it('reads a comma-separated status, so an export URL means what the table showed', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: 'waitlisted,cancelled' }, QUESTIONS)
    expect(calls).toContainEqual(['in', 'status', ['waitlisted', 'cancelled']])
  })

  it('treats every status ticked as no filter at all', () => {
    // Otherwise the query carries a redundant four-way .in() that can only
    // ever match everything.
    const { q, calls } = mockQuery()
    applyParticipantFilters(
      q,
      { status: ['pending', 'confirmed', 'waitlisted', 'cancelled'] },
      QUESTIONS
    )
    expect(calls.some((c) => c[1] === 'status')).toBe(false)
  })

  it('ignores an unknown status rather than erroring the whole query', () => {
    // `status` is an enum column and the export URL is user-editable, so a
    // junk value would fail the request outright.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: 'confirmed,bogus' }, QUESTIONS)
    expect(calls).toContainEqual(['eq', 'status', 'confirmed'])
  })
})

describe('parseStatusFilter', () => {
  it('accepts a list, a comma string, and the old single value', () => {
    expect(parseStatusFilter(['confirmed'])).toEqual(['confirmed'])
    expect(parseStatusFilter('waitlisted,cancelled')).toEqual(['waitlisted', 'cancelled'])
    expect(parseStatusFilter('confirmed')).toEqual(['confirmed'])
  })

  it('normalizes to canonical order and drops duplicates', () => {
    // The export URL is built from this, so the same selection must always
    // produce the same string.
    expect(parseStatusFilter('cancelled,confirmed,cancelled')).toEqual(['confirmed', 'cancelled'])
  })

  it('returns nothing for empty, null and junk input', () => {
    expect(parseStatusFilter('')).toEqual([])
    expect(parseStatusFilter(null)).toEqual([])
    expect(parseStatusFilter(undefined)).toEqual([])
    expect(parseStatusFilter('deleted')).toEqual([])
  })
})

describe('parseTypeFilter', () => {
  it('accepts a list, a comma string and a single id', () => {
    expect(parseTypeFilter([T1, T2])).toEqual([T1, T2])
    expect(parseTypeFilter(`${T1},${T2}`)).toEqual([T1, T2])
    expect(parseTypeFilter(T1)).toEqual([T1])
  })

  it('keeps the given order and drops duplicates', () => {
    // There is no canonical order to fall back on — the ids are per-event —
    // so the console's own type order is what gets preserved.
    expect(parseTypeFilter([T2, T1, T2])).toEqual([T2, T1])
  })

  it('rejects anything that is not a uuid', () => {
    // Reaches PostgREST as a uuid comparison, so junk fails the whole query
    // rather than matching nothing.
    expect(parseTypeFilter('T1')).toEqual([])
    expect(parseTypeFilter('')).toEqual([])
    expect(parseTypeFilter(null)).toEqual([])
    expect(parseTypeFilter(`${T1}; drop table participants`)).toEqual([])
  })

  it('sanitizes search (strips parens/commas) into an or() of name+email+profile+answers', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: '  Smith (guest), x ' }, QUESTIONS)
    const or = calls.find((c) => c[0] === 'or')
    expect(or[1]).toBe(
      'first_name.ilike.%Smith guest x%,last_name.ilike.%Smith guest x%,email.ilike.%Smith guest x%,' +
        'profile_name.ilike.%Smith guest x%,profile_email.ilike.%Smith guest x%,' +
        'answers_text.ilike.%Smith guest x%'
    )
  })

  it('searches the answers, since a form may collect the name as a text question', () => {
    // first_name/last_name are only populated from a `name`-type question, so
    // on those events every identifying string lives in `answers` and the
    // participant would otherwise be unfindable by the name shown in the table.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: 'Stephen' }, QUESTIONS)
    const or = calls.find((c) => c[0] === 'or')
    expect(or[1]).toContain('answers_text.ilike.%Stephen%')
  })

  it('matches choice option labels to option IDs in search', () => {
    const questions = [
      {
        id: 'q_role',
        type: 'select',
        options: [
          { value: 'opt_vip', label: { en: 'VIP Speaker', es: 'Orador VIP' } },
          { value: 'opt_student', label: 'Student Ticket' },
        ],
      },
    ]
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: 'VIP' }, questions)
    const or = calls.find((c) => c[0] === 'or')
    expect(or[1]).toContain('answers->>q_role.ilike.%opt_vip%')
    // The non-matching option must not widen the search.
    expect(or[1]).not.toContain('opt_student')
  })

  it('matches an option label in any locale, not just the active one', () => {
    // An organizer working in en must still find a row whose option was
    // authored in the event's own language.
    const questions = [
      { id: 'q_role', type: 'radio', options: [{ value: 'opt_1', label: { en: 'Male', ru: 'Мужской' } }] },
    ]
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: 'Мужской' }, questions)
    expect(calls.find((c) => c[0] === 'or')[1]).toContain('answers->>q_role.ilike.%opt_1%')
  })

  it('de-duplicates the same option across an event\'s form versions', () => {
    const dup = { id: 'q_role', type: 'select', options: [{ value: 'opt_1', label: 'Red' }] }
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: 'Red' }, [dup, { ...dup }])
    const clauses = calls.find((c) => c[0] === 'or')[1].split(',')
    expect(clauses.filter((c) => c === 'answers->>q_role.ilike.%opt_1%')).toHaveLength(1)
  })

  it('caps option clauses so a one-letter search cannot blow up the URL', () => {
    const questions = Array.from({ length: 20 }, (_, qi) => ({
      id: `q_${qi}`,
      type: 'select',
      options: Array.from({ length: 10 }, (_, oi) => ({ value: `opt_${qi}_${oi}`, label: 'aaa' })),
    }))
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: 'a' }, questions)
    const optionClauses = calls
      .find((c) => c[0] === 'or')[1]
      .split(',')
      .filter((c) => c.startsWith('answers->>'))
    expect(optionClauses.length).toBeLessThanOrEqual(60)
  })

  it('ignores ids or option values that could break out of the or() syntax', () => {
    const questions = [
      { id: 'q_bad,x', type: 'select', options: [{ value: 'opt_1', label: 'Red' }] },
      { id: 'q_ok', type: 'select', options: [{ value: 'opt,evil', label: 'Red' }] },
    ]
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { search: 'Red' }, questions)
    const or = calls.find((c) => c[0] === 'or')[1]
    expect(or).not.toContain('q_bad')
    expect(or).not.toContain('opt,evil')
    // The six base clauses survive untouched.
    expect(or.split(',').filter((c) => c.startsWith('answers->>'))).toHaveLength(0)
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

  // Every call applies this, so the two "nothing else was added" tests below
  // compare against it rather than against an empty list.
  const ARCHIVE = ['is', 'deleted_at', null]

  it('always hides archived participants', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, {}, QUESTIONS)
    expect(calls).toContainEqual(ARCHIVE)
  })

  it('IGNORES answer filters whose question id is unknown (export-URL guard)', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { 'evil)=;drop': 'x' } }, QUESTIONS)
    expect(calls).toEqual([ARCHIVE])
  })

  it('skips empty/null filter values', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: '', answerFilters: { q_txt: '' } }, QUESTIONS)
    expect(calls).toEqual([ARCHIVE])
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

  it('reg_no sorts by the two integers so 7.9 precedes 7.10', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: 'reg_no', dir: 'asc' }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'reg_seq', { ascending: true }])
    expect(calls[1]).toEqual(['order', 'member_index', { ascending: true }])
    expect(calls[2]).toEqual(['order', 'id', { ascending: true }])
  })

  it('profile columns are sortable', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: 'profile_email', dir: 'desc' }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'profile_email', { ascending: false }])
  })

  it('no column → default newest first', () => {
    const { q, calls } = mockQuery()
    applyParticipantSort(q, { column: null }, QUESTIONS)
    expect(calls[0]).toEqual(['order', 'created_at', { ascending: false }])
    expect(calls[1]).toEqual(['order', 'id', { ascending: true }])
  })
})
