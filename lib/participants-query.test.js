import { describe, it, expect } from 'vitest'
import {
  applyParticipantFilters,
  applyParticipantSort,
  parseStatusFilter,
  parseTypeFilter,
  PARTICIPANT_STATUSES,
  STATUS_TRANSITIONS,
  normalizeAnswerFilter,
  defaultOpFor,
  FILTER_OPS_BY_TYPE,
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
    // Otherwise the query carries a redundant .in() over every status, which
    // can only ever match everything.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: ['confirmed', 'waitlisted', 'cancelled'] }, QUESTIONS)
    expect(calls.some((c) => c[1] === 'status')).toBe(false)
  })

  it('still ignores a stale pending in an old bookmark, leaving the rest a full set', () => {
    // A saved filter from before 0051 may still name it; dropping it must not
    // turn "everything ticked" into a real filter.
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

  it('requires EVERY ticked option on a multiple-choice (many) answer', () => {
    // AND, not OR: one jsonb containment, true only when the stored array
    // holds both — "who picked Monday *and* Tuesday".
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { q_ms: ['a', 'b'] } }, QUESTIONS)
    expect(calls).toContainEqual(['contains', 'answers', { q_ms: ['a', 'b'] }])
  })

  it('reads a comma-separated multiselect filter from an export URL', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { q_ms: 'a,b' } }, QUESTIONS)
    expect(calls).toContainEqual(['contains', 'answers', { q_ms: ['a', 'b'] }])
  })

  it('treats an emptied multiselect checklist as no filter', () => {
    // `[]` is neither '' nor null, so it reaches the loop and must be dropped
    // rather than sent as `contains(answers, {q: []})`, which matches every row.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { q_ms: [] } }, QUESTIONS)
    expect(calls).toEqual([['is', 'deleted_at', null]])
  })

  it('finds the un-ticked rows when a checkbox filter is set to No', () => {
    // An unticked box is pruned from `answers` entirely, so the absent rows are
    // the target; `answers->>q != 'true'` would miss them all, NULL comparisons
    // never being true.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { q_chk: 'false' } }, QUESTIONS)
    expect(calls).toContainEqual(['not', 'answers', 'cs', '{"q_chk":true}'])
  })

  // Every call applies this, so the two "nothing else was added" tests below
  // compare against it rather than against an empty list.
  const ARCHIVE = ['is', 'deleted_at', null]

  it('always hides archived participants', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, {}, QUESTIONS)
    expect(calls).toContainEqual(ARCHIVE)
  })

  it('returns nothing for an answer filter whose question id is unknown', () => {
    // This used to assert the opposite — that an unknown id was ignored — as an
    // export-URL guard. Ignoring it does not narrow the list, it widens it, and
    // that is what let a filtered export hand back rows the organizer had
    // excluded. A junk id from a hand-edited URL now yields an empty result,
    // which is the safer way for it to fail; the id is still never interpolated
    // into a query.
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { answerFilters: { 'evil)=;drop': 'x' } }, QUESTIONS)
    expect(calls).toEqual([ARCHIVE, ['in', 'id', []]])
  })

  it('skips empty/null filter values', () => {
    const { q, calls } = mockQuery()
    applyParticipantFilters(q, { status: '', answerFilters: { q_txt: '' } }, QUESTIONS)
    expect(calls).toEqual([ARCHIVE])
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

describe('the statuses a participant can hold', () => {
  it('does not offer pending, which nothing can produce', () => {
    // submit_registration assigns only confirmed or waitlisted and no
    // transition targets pending, so the filter option could only ever return
    // nothing. Migration 0051 dropped the column default that kept it alive.
    expect(PARTICIPANT_STATUSES).toEqual(['confirmed', 'waitlisted', 'cancelled'])
  })

  it('drops pending from a filter that still names it', () => {
    // An old bookmark or export URL may still carry it.
    expect(parseStatusFilter('pending,confirmed')).toEqual(['confirmed'])
    expect(parseStatusFilter(['pending'])).toEqual([])
  })
})

describe('STATUS_TRANSITIONS', () => {
  it('lets an organizer take a seat back without cancelling', () => {
    // Previously confirmed could only be cancelled — which promotes the
    // longest-waiting person immediately, so the seat being reassigned was
    // gone before the organizer could act.
    expect(STATUS_TRANSITIONS.confirmed).toContain('waitlisted')
    expect(STATUS_TRANSITIONS.confirmed).toContain('cancelled')
  })

  it('never names pending as a source or a destination', () => {
    expect(STATUS_TRANSITIONS.pending).toBeUndefined()
    for (const targets of Object.values(STATUS_TRANSITIONS)) {
      expect(targets).not.toContain('pending')
    }
  })

  it('only ever moves between statuses that exist', () => {
    for (const [from, targets] of Object.entries(STATUS_TRANSITIONS)) {
      expect(PARTICIPANT_STATUSES).toContain(from)
      for (const to of targets) expect(PARTICIPANT_STATUSES).toContain(to)
    }
  })

  it('never offers a move to the status already held', () => {
    for (const [from, targets] of Object.entries(STATUS_TRANSITIONS)) {
      expect(targets).not.toContain(from)
    }
  })

  it('gives every status somewhere to go, so no row can be stranded', () => {
    for (const s of PARTICIPANT_STATUSES) {
      expect(STATUS_TRANSITIONS[s]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

const Q = {
  txt: { id: 'q_txt', type: 'text' },
  sel: { id: 'q_sel', type: 'select' },
  ms: { id: 'q_ms', type: 'multiselect' },
  chk: { id: 'q_chk', type: 'checkbox' },
  date: { id: 'q_date', type: 'date' },
  num: { id: 'q_num', type: 'number' },
  file: { id: 'q_file', type: 'file' },
}
const ALL = Object.values(Q)
const run = (filters) => {
  const { q, calls } = mockQuery()
  applyParticipantFilters(q, filters, ALL)
  return calls
}

describe('check-in reaches the shared filter', () => {
  // It used to be applied inline by the console only, and the export had no
  // parameter for it — so filtering to "checked in" and downloading gave you
  // everyone. Putting it here is the fix: both surfaces call this function.
  it('narrows to those checked in', () => {
    expect(run({ checkin: 'in' })).toContainEqual(['not', 'checked_in_at', 'is', null])
  })
  it('narrows to those not checked in', () => {
    expect(run({ checkin: 'out' })).toContainEqual(['is', 'checked_in_at', null])
  })
  it('ignores anything else', () => {
    expect(run({ checkin: '' }).some((c) => c[1] === 'checked_in_at')).toBe(false)
  })
})

describe('registered-at window', () => {
  it('takes a closed range, with the end day included', () => {
    // `to` is inclusive to the organizer, so it compiles to "< the next day".
    const calls = run({ registeredFrom: '2026-08-01', registeredTo: '2026-08-03' })
    expect(calls).toContainEqual(['gte', 'created_at', '2026-08-01T00:00:00Z'])
    expect(calls).toContainEqual(['lt', 'created_at', '2026-08-04T00:00:00Z'])
  })
  it('accepts an open-ended range', () => {
    const calls = run({ registeredFrom: '2026-08-01' })
    expect(calls).toContainEqual(['gte', 'created_at', '2026-08-01T00:00:00Z'])
    expect(calls.some((c) => c[0] === 'lt' && c[1] === 'created_at')).toBe(false)
  })
  it('crosses a month end correctly', () => {
    expect(run({ registeredTo: '2026-08-31' })).toContainEqual([
      'lt', 'created_at', '2026-09-01T00:00:00Z',
    ])
  })
})

describe('answer filter operators', () => {
  it('finds unanswered questions — the "who has not uploaded" case', () => {
    // A pruned answer is absent from `answers`, so `->>` is NULL; the empty
    // string covers legacy rows written before pruning.
    expect(run({ answerFilters: { q_file: { op: 'empty' } } })).toContainEqual([
      'or', 'answers->>q_file.is.null,answers->>q_file.eq.',
    ])
  })

  it('finds answered ones, excluding blanks', () => {
    const calls = run({ answerFilters: { q_file: { op: 'notEmpty' } } })
    expect(calls).toContainEqual(['not', 'answers->>q_file', 'is', null])
    expect(calls).toContainEqual(['neq', 'answers->>q_file', ''])
  })

  it('compares text exactly, or not at all', () => {
    expect(run({ answerFilters: { q_txt: { op: 'eq', value: 'Ada' } } }))
      .toContainEqual(['eq', 'answers->>q_txt', 'Ada'])
    expect(run({ answerFilters: { q_txt: { op: 'neq', value: 'Ada' } } }))
      .toContainEqual(['neq', 'answers->>q_txt', 'Ada'])
  })

  it('matches a choice against several options at once', () => {
    // "Day 1 or Day 2" — a radio holds exactly one value, so this is a plain
    // .in(), and was simply not expressible before.
    expect(run({ answerFilters: { q_sel: { op: 'anyOf', value: ['opt_1', 'opt_2'] } } }))
      .toContainEqual(['in', 'answers->>q_sel', ['opt_1', 'opt_2']])
  })

  it('excludes every named option for a multiselect', () => {
    // AND of negated containments, which PostgREST combines for us.
    const calls = run({ answerFilters: { q_ms: { op: 'hasNone', value: ['a', 'b'] } } })
    expect(calls).toContainEqual(['not', 'answers', 'cs', '{"q_ms":["a"]}'])
    expect(calls).toContainEqual(['not', 'answers', 'cs', '{"q_ms":["b"]}'])
  })

  it('compares dates as text, which is chronological for ISO dates', () => {
    expect(run({ answerFilters: { q_date: { op: 'after', value: '2026-08-20' } } }))
      .toContainEqual(['gt', 'answers->>q_date', '2026-08-20'])
    expect(run({ answerFilters: { q_date: { op: 'before', value: '2026-08-20' } } }))
      .toContainEqual(['lt', 'answers->>q_date', '2026-08-20'])
  })

  it('takes a date range', () => {
    const calls = run({
      answerFilters: { q_date: { op: 'between', value: { from: '2026-08-01', to: '2026-08-31' } } },
    })
    expect(calls).toContainEqual(['gte', 'answers->>q_date', '2026-08-01'])
    expect(calls).toContainEqual(['lte', 'answers->>q_date', '2026-08-31'])
  })

  it('casts numbers, because 9 is not above 10 as text', () => {
    expect(run({ answerFilters: { q_num: { op: 'gt', value: '18' } } }))
      .toContainEqual(['gt', 'answers->>q_num::numeric', '18'])
    expect(run({ answerFilters: { q_num: { op: 'eq', value: '18' } } }))
      .toContainEqual(['eq', 'answers->>q_num::numeric', '18'])
  })

  it('leaves checkbox on containment, since an unticked box is absent', () => {
    expect(run({ answerFilters: { q_chk: 'false' } }))
      .toContainEqual(['not', 'answers', 'cs', '{"q_chk":true}'])
    expect(run({ answerFilters: { q_chk: 'true' } }))
      .toContainEqual(['contains', 'answers', { q_chk: true }])
  })

  it('ignores an operator the question type does not offer', () => {
    // The export URL is user-editable; a junk operator must narrow nothing
    // rather than compile to something arbitrary.
    expect(run({ answerFilters: { q_txt: { op: 'hasNone', value: ['x'] } } })
      .some((c) => String(c[1]).includes('q_txt'))).toBe(false)
  })
})

describe('a filter naming a question this list does not have', () => {
  // The real case: an xlsx exported from the All tab writes a sheet per bucket,
  // and the All tab's filters may name questions only the group form asks. On
  // thai-ccci, "Your passport scan is not empty" means nothing to the
  // individual list — and skipping it there did not narrow that sheet, it
  // widened it, handing back a male individual registrant with no passport scan
  // whom the organizer had filtered out.
  it('returns no rows rather than dropping the condition', () => {
    const calls = run({ answerFilters: { q_not_in_this_bucket: { op: 'notEmpty' } } })
    expect(calls).toContainEqual(['in', 'id', []])
  })

  it('does the same for a plain value', () => {
    expect(run({ answerFilters: { q_elsewhere: 'Male' } })).toContainEqual(['in', 'id', []])
  })

  it('still ignores one carrying no value, so an emptied control blanks nothing', () => {
    for (const blank of ['', null, []]) {
      expect(run({ answerFilters: { q_elsewhere: blank } }).some((c) => c[0] === 'in' && c[1] === 'id')).toBe(false)
    }
  })

  it('leaves a filter the list CAN evaluate working normally', () => {
    const calls = run({ answerFilters: { q_txt: { op: 'notEmpty' } } })
    expect(calls.some((c) => c[0] === 'in' && c[1] === 'id')).toBe(false)
    expect(calls).toContainEqual(['not', 'answers->>q_txt', 'is', null])
  })
})

describe('normalizeAnswerFilter', () => {
  it('reads the pre-operator shapes unchanged, so old export links still work', () => {
    expect(normalizeAnswerFilter(Q.txt, 'ann')).toEqual({ op: 'contains', value: 'ann' })
    expect(normalizeAnswerFilter(Q.sel, 'opt_1')).toEqual({ op: 'is', value: 'opt_1' })
    expect(normalizeAnswerFilter(Q.ms, ['a', 'b'])).toEqual({ op: 'hasAll', value: ['a', 'b'] })
  })

  it('treats an emptied control as no filter', () => {
    expect(normalizeAnswerFilter(Q.txt, '')).toBeNull()
    expect(normalizeAnswerFilter(Q.txt, null)).toBeNull()
    expect(normalizeAnswerFilter(Q.ms, [])).toBeNull()
    expect(normalizeAnswerFilter(Q.date, { op: 'between', value: { from: '', to: '' } })).toBeNull()
  })

  it('keeps a half-open range, which is still a filter', () => {
    expect(normalizeAnswerFilter(Q.date, { op: 'between', value: { from: '2026-08-01', to: '' } }))
      .toEqual({ op: 'between', value: { from: '2026-08-01', to: null } })
  })

  it('needs no value for a presence operator', () => {
    expect(normalizeAnswerFilter(Q.file, { op: 'empty' })).toEqual({ op: 'empty', value: null })
  })

  it('rejects an operator the type does not offer', () => {
    expect(normalizeAnswerFilter(Q.txt, { op: 'between', value: { from: '1' } })).toBeNull()
    expect(normalizeAnswerFilter(Q.file, { op: 'contains', value: 'x' })).toBeNull()
  })
})

describe('FILTER_OPS_BY_TYPE', () => {
  it('offers presence filters on every type that can go unanswered', () => {
    for (const [type, ops] of Object.entries(FILTER_OPS_BY_TYPE)) {
      if (type === 'checkbox') continue // an unticked box is a value, not a blank
      expect(ops).toContain('empty')
      expect(ops).toContain('notEmpty')
    }
  })

  it('names a default operator for every type it covers', () => {
    for (const type of Object.keys(FILTER_OPS_BY_TYPE)) {
      expect(FILTER_OPS_BY_TYPE[type][0]).toBe(defaultOpFor(type))
    }
  })

  it('falls back to the text operators for a type it has never seen', () => {
    expect(defaultOpFor('something_new')).toBe('contains')
  })
})
