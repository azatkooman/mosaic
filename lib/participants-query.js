// @ts-check
/**
 * Shared filter + sort logic for the participants list AND the export, so a
 * download always matches exactly what the console table shows. Both callers
 * pass a PostgREST query builder (browser client for the table, service-role
 * client for the export) plus the same `questions` list; these helpers apply
 * the filters/order and return the builder.
 */

/**
 * The "Reg. #" an organizer sees: the registration's per-event number, plus
 * the member's position within it when the registration covers more than one
 * person (family mode). Kept here so the console list and the export can
 * never disagree about a participant's identifier.
 *
 * @param {{reg_seq?:number|null, member_index?:number|null}} p
 * @returns {string} e.g. '7.1' — or '' for a row predating migration 0030
 */
export function formatRegNo(p) {
  if (p?.reg_seq == null) return ''
  return `${p.reg_seq}.${p.member_index ?? 1}`
}

// Column key (from the UI) → real participants column(s) to order by. A list
// orders by each in turn: "Reg. #" is displayed as `<reg_seq>.<member_index>`
// but must sort on the two integers, so 7.9 comes before 7.10.
const SORT_COLUMNS = {
  reg_no: ['reg_seq', 'member_index'],
  first_name: ['first_name'],
  last_name: ['last_name'],
  email: ['email'],
  type: ['participant_type_id'], // groups participants by type
  status: ['status'],
  profile_name: ['profile_name'],
  profile_email: ['profile_email'],
  created_at: ['created_at'],
}

/**
 * The statuses a participant can hold — the filter's full option set.
 *
 * 'pending' is deliberately absent. It is still a value of the Postgres enum
 * (which cannot drop one), but submit_registration assigns only 'confirmed' or
 * 'waitlisted' and no transition targets it, so nothing can produce one and the
 * filter option could only ever return nothing. Migration 0051 dropped the
 * column default that was the last thing keeping it alive.
 */
export const PARTICIPANT_STATUSES = ['confirmed', 'waitlisted', 'cancelled']

/**
 * Which statuses a participant may move to, keyed by the one they hold.
 *
 * A mirror of the matrix `transition_participant_status` enforces (migration
 * 0051) — the RPC is the authority and rejects anything this lets through; this
 * exists so the console offers only moves that will succeed.
 *
 * 'pending' appears on neither side: nothing can be in it, so nothing can leave
 * it. confirmed → waitlisted takes a seat back deliberately and does NOT
 * promote the waitlist, so the freed seat stays free for the organizer to
 * reassign; cancelling is the transition that promotes.
 */
export const STATUS_TRANSITIONS = {
  confirmed: ['waitlisted', 'cancelled'],
  waitlisted: ['confirmed', 'cancelled'],
  cancelled: ['confirmed', 'waitlisted'],
}

/**
 * Normalize a status filter to a list of valid statuses.
 *
 * Accepts an array (the console's checklist state) or a comma-separated string
 * (the export URL, and any older link that carried a single `?status=confirmed`
 * — which still means exactly what it used to). Unknown values are dropped
 * rather than passed through: they would reach PostgREST as an enum comparison
 * and error the whole query, and the export URL is user-editable.
 *
 * An empty result means "no status filter", NOT "match nothing" — every status
 * ticked and none ticked both show everything, which is what an organizer
 * reading the checklist expects.
 *
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export function parseStatusFilter(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  const seen = new Set()
  for (const item of raw) {
    const s = String(item ?? '').trim()
    if (PARTICIPANT_STATUSES.includes(s)) seen.add(s)
  }
  return PARTICIPANT_STATUSES.filter((s) => seen.has(s))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalize a participant-type filter to a list of ids.
 *
 * Same shape as `parseStatusFilter` and for the same reasons, but the values
 * are per-event UUIDs rather than a fixed set, so there is no allowlist to
 * check against — only the format. That is enough for the job it has to do:
 * an id belonging to another event simply matches no rows, whereas a
 * malformed one is a uuid comparison that errors the whole query, and the
 * export URL is user-editable. Order is preserved as given (the console sends
 * them in the event's own type order) with duplicates dropped.
 *
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export function parseTypeFilter(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  const out = []
  for (const item of raw) {
    const id = String(item ?? '').trim()
    if (UUID_RE.test(id) && !out.includes(id)) out.push(id)
  }
  return out
}

/**
 * Which operators each question type offers, in menu order. The first is the
 * default, so a bare value (`{q: 'ann'}`) keeps meaning exactly what it meant
 * before operators existed — which is what lets an export URL saved months ago
 * still describe the same rows.
 *
 * Every type ends with empty/notEmpty. "Who has not uploaded their passport
 * scan yet" is the question organizers ask most and the one the old filter set
 * could not express at all, so it is offered even for types (file, address)
 * that have nothing else worth filtering on.
 */
export const FILTER_OPS_BY_TYPE = {
  text: ['contains', 'eq', 'neq', 'empty', 'notEmpty'],
  textarea: ['contains', 'eq', 'neq', 'empty', 'notEmpty'],
  email: ['contains', 'eq', 'neq', 'empty', 'notEmpty'],
  phone: ['contains', 'eq', 'neq', 'empty', 'notEmpty'],
  name: ['contains', 'empty', 'notEmpty'],
  address: ['contains', 'empty', 'notEmpty'],
  file: ['empty', 'notEmpty'],
  select: ['is', 'isNot', 'anyOf', 'empty', 'notEmpty'],
  radio: ['is', 'isNot', 'anyOf', 'empty', 'notEmpty'],
  multiselect: ['hasAll', 'hasNone', 'empty', 'notEmpty'],
  checkbox: ['is'],
  date: ['on', 'before', 'after', 'between', 'empty', 'notEmpty'],
  number: ['eq', 'neq', 'gt', 'lt', 'between', 'empty', 'notEmpty'],
}

/** Operators that filter on presence alone and take no value. */
export const OPS_WITHOUT_VALUE = new Set(['empty', 'notEmpty'])
/** Operators taking two values (a closed range). */
export const OPS_WITH_RANGE = new Set(['between'])
/** Operators taking a list. */
export const OPS_WITH_LIST = new Set(['anyOf', 'hasAll', 'hasNone'])

/** The operator a question type uses when a filter names no operator. */
export function defaultOpFor(type) {
  return (FILTER_OPS_BY_TYPE[type] ?? FILTER_OPS_BY_TYPE.text)[0]
}

const asList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)

/**
 * Coerce whatever the console or an export URL supplied into `{op, value}`,
 * or null when it filters nothing.
 *
 * Accepts the pre-operator shapes unchanged: a bare string, and a bare array
 * for multiselect. An emptied checklist is `[]` — present, but filtering
 * nothing — and must not narrow the query.
 *
 * @returns {{op:string, value:any}|null}
 */
export function normalizeAnswerFilter(question, raw) {
  const type = question?.type
  const allowed = FILTER_OPS_BY_TYPE[type] ?? FILTER_OPS_BY_TYPE.text
  const isObject = raw && typeof raw === 'object' && !Array.isArray(raw)
  const op = isObject && raw.op ? String(raw.op) : defaultOpFor(type)
  if (!allowed.includes(op)) return null
  if (OPS_WITHOUT_VALUE.has(op)) return { op, value: null }

  const value = isObject ? raw.value : raw
  if (OPS_WITH_RANGE.has(op)) {
    const [from, to] = Array.isArray(value) ? value : [value?.from, value?.to]
    // A half-open range is still a filter; only an entirely empty one is not.
    if (!from && !to) return null
    return { op, value: { from: from || null, to: to || null } }
  }
  if (OPS_WITH_LIST.has(op)) {
    const list = asList(value)
    return list.length ? { op, value: list } : null
  }
  if (value === '' || value == null) return null
  return { op, value: String(value) }
}

/**
 * One answer filter, compiled to PostgREST.
 *
 * `answers->>id` is text, which is why dates compare directly: they are stored
 * as `YYYY-MM-DD`, where lexicographic order IS chronological order. Numbers
 * are not — '9' sorts above '10' — so those cast, which is safe for a value
 * stored either as a JSON number or as a numeric string, and errors the query
 * only if a row holds text under a question that is a number today.
 */
function applyAnswerFilter(q, question, { op, value }) {
  const qid = question.id
  const path = `answers->>${qid}`
  const num = `answers->>${qid}::numeric`

  // Checkbox is the one type that cannot be compared through `->>` at all.
  // 'false' means "did not tick", which is NOT the same as storing false:
  // validate.js prunes an unticked box, so the key is absent from `answers`
  // altogether. `not.cs` covers both that absence and any legacy row that did
  // store false, where `answers->>qid != 'true'` would drop the absent rows,
  // SQL comparisons against NULL never being true.
  if (question.type === 'checkbox') {
    return value === 'false'
      ? q.not('answers', 'cs', JSON.stringify({ [qid]: true }))
      : q.contains('answers', { [qid]: true })
  }

  switch (op) {
    // A pruned answer is absent from `answers` entirely rather than stored
    // blank, so `->>` yields SQL NULL; the empty string covers anything a
    // legacy row wrote before validate.js pruned.
    case 'empty':
      return q.or(`${path}.is.null,${path}.eq.`)
    case 'notEmpty':
      return q.not(path, 'is', null).neq(path, '')

    case 'contains':
      return q.ilike(path, `%${value}%`)
    // Deliberately strict: "is not X" means answered, and not X. A row that
    // answered nothing is matched by `empty`, which keeps each operator to one
    // meaning rather than quietly folding blanks into every negative filter.
    case 'eq':
    case 'is':
      return question.type === 'number' ? q.eq(num, value) : q.eq(path, value)
    case 'neq':
    case 'isNot':
      return question.type === 'number' ? q.neq(num, value) : q.neq(path, value)
    case 'anyOf':
      return q.in(path, value)

    // Containment expresses AND exactly: `answers @> {"q":["a","b"]}` holds
    // only when the stored array has both. hasNone is the same test negated
    // once per option, which PostgREST ANDs — hasANY would need an OR of JSON
    // values inside .or(), whose comma-and-brace syntax cannot carry them.
    case 'hasAll':
      return q.contains('answers', { [qid]: value })
    case 'hasNone':
      for (const v of value) q = q.not('answers', 'cs', JSON.stringify({ [qid]: [v] }))
      return q

    case 'on':
      return q.eq(path, value)
    case 'before':
      return q.lt(path, value)
    case 'after':
      return q.gt(path, value)
    case 'gt':
      return q.gt(num, value)
    case 'lt':
      return q.lt(num, value)
    case 'between': {
      const col = question.type === 'number' ? num : path
      if (value.from) q = q.gte(col, value.from)
      if (value.to) q = q.lte(col, value.to)
      return q
    }
    default:
      return q
  }
}

/** The day after an ISO date, for turning an inclusive `to` into `< next`. */
function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {any} q PostgREST query builder for `participants`
 * @param {{status?:string|string[], typeId?:string|string[], search?:string, answerFilters?:Object,
 *   formVersionIds?:string[]|null, checkin?:string, registeredFrom?:string, registeredTo?:string}} f
 *   `formVersionIds` restricts the list to one registration bucket (individual
 *   vs group — see lib/event-questions). An empty array means the event has no
 *   forms in that bucket, which must return nothing rather than everything.
 * @param {Array<{id:string,type:string}>} questions
 */
export function applyParticipantFilters(q, f = {}, questions = []) {
  const { status, typeId, search, answerFilters, formVersionIds, checkin, registeredFrom, registeredTo } = f
  // Archived participants (migration 0033) are gone from the console for good:
  // RLS already hides them from everyone but admins, and this hides them from
  // admins too, so the list and the export agree with each other and with what
  // a non-admin sees. The planned admin archive tab is where they resurface.
  q = q.is('deleted_at', null)
  if (Array.isArray(formVersionIds)) {
    // `.in()` with an empty list yields no rows, which is exactly right here.
    q = q.in('form_version_id', formVersionIds)
  }
  // Status is a checklist, so several may be ticked at once — "waitlisted and
  // cancelled, but not confirmed" is a real question an organizer asks and a
  // single-select could not express. All four ticked is the same as none, and
  // both are left unfiltered rather than sent as a four-way .in().
  const statuses = parseStatusFilter(status)
  if (statuses.length > 0 && statuses.length < PARTICIPANT_STATUSES.length) {
    q = statuses.length === 1 ? q.eq('status', statuses[0]) : q.in('status', statuses)
  }
  // Also a checklist — "staff and students but not children" is the same kind
  // of question as the status one. Unlike status there is no "all of them"
  // shortcut to detect: the set of types is per-event, so ticking every box
  // is a genuine .in() over exactly the ids the console listed.
  const typeIds = parseTypeFilter(typeId)
  if (typeIds.length > 0) {
    q = typeIds.length === 1 ? q.eq('participant_type_id', typeIds[0]) : q.in('participant_type_id', typeIds)
  }
  if (search && search.trim()) {
    // .or() takes raw PostgREST syntax: commas separate clauses and
    // parentheses group them, so both must be stripped from user input.
    const s = search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ')
    // Profile name/email are included because a form need not ask for a name
    // or email at all — for those events the registrant's profile is the only
    // thing there is to search by. Note it is the ACCOUNT HOLDER's name, which
    // is why it cannot be the only thing searched: on a group registration
    // every member carries the organizer-facing name of whoever signed them up.
    //
    // answers_text (migration 0045) is the answer values flattened to text.
    // Without it, an event whose form asks for a name as a plain text question
    // — so first_name/last_name stay empty — was unsearchable by participant
    // name, which is the name the table actually displays.
    //
    // Choice questions (select/radio/multiselect) store an option ID minted by
    // the form builder — `opt_<n>_<base36>` — never the label, which lives only
    // in the form definition. So the label an organizer sees in the table is a
    // string no column contains, and typing it found nobody. Migration 0047
    // drops those IDs from answers_text (searching "opt" used to return 45% of
    // a real event); this resolves the other direction, matching the typed text
    // against the labels we hold here and searching for the IDs they belong to.
    //
    // Every locale's label is checked, not just the active one: the organizer
    // may be working in en while the option was authored in the event's own
    // language, and either spelling should find the row.
    const sLower = s.toLowerCase()
    const labelMatches = (label) => {
      if (typeof label === 'string') return label.toLowerCase().includes(sLower)
      if (label && typeof label === 'object') {
        return Object.values(label).some(
          (v) => typeof v === 'string' && v.toLowerCase().includes(sLower)
        )
      }
      return false
    }

    // Deduplicated because the same question id + option value recurs across an
    // event's form versions, and capped because a one-letter search can match
    // most of the labels on the form: each match adds ~55 characters to a URL
    // that has to survive PostgREST's request-line limit. Events today carry at
    // most 8 options per version, so the cap is headroom, not a silent trim —
    // but a truncated OR would quietly drop matches, so it is worth bounding.
    const optionClauses = new Set()
    const MAX_OPTION_CLAUSES = 60
    for (const question of questions) {
      // Interpolated raw into PostgREST's .or() syntax, so anything outside
      // [A-Za-z0-9_] could break out of the clause. Builder-generated ids never
      // do; this guards a hand-edited definition rather than a real case.
      if (!question?.id || !/^[A-Za-z0-9_]+$/.test(question.id)) continue
      if (!Array.isArray(question.options)) continue
      for (const option of question.options) {
        if (!option?.value || !/^[A-Za-z0-9_-]+$/.test(option.value)) continue
        if (!labelMatches(option.label)) continue
        optionClauses.add(`answers->>${question.id}.ilike.%${option.value}%`)
        if (optionClauses.size >= MAX_OPTION_CLAUSES) break
      }
      if (optionClauses.size >= MAX_OPTION_CLAUSES) break
    }

    const orClauses = [
      `first_name.ilike.%${s}%`,
      `last_name.ilike.%${s}%`,
      `email.ilike.%${s}%`,
      `profile_name.ilike.%${s}%`,
      `profile_email.ilike.%${s}%`,
      `answers_text.ilike.%${s}%`,
      ...optionClauses,
    ]

    q = q.or(orClauses.join(','))
  }
  // Check-in lives here rather than at the call site so it reaches BOTH
  // surfaces. It used to be applied inline by the console only, and the export
  // had no parameter for it at all — so filtering to "checked in" and
  // downloading gave you everyone, silently.
  if (checkin === 'in') q = q.not('checked_in_at', 'is', null)
  else if (checkin === 'out') q = q.is('checked_in_at', null)

  // When they registered. `created_at` is a timestamptz and these are plain
  // dates, so the window is [from 00:00, to 24:00) in UTC — close enough for
  // picking out a day's intake, and stated here because an event in Bangkok
  // will see its own midnight fall inside the neighbouring day.
  if (registeredFrom) q = q.gte('created_at', `${registeredFrom}T00:00:00Z`)
  if (registeredTo) q = q.lt('created_at', `${nextDay(registeredTo)}T00:00:00Z`)

  for (const [qid, raw] of Object.entries(answerFilters ?? {})) {
    const question = questions.find((x) => x.id === qid)
    if (!question) continue // ignore unknown ids — guards the export URL params
    const f = normalizeAnswerFilter(question, raw)
    if (!f) continue
    q = applyAnswerFilter(q, question, f)
  }
  return q
}

/**
 * @param {any} q PostgREST query builder for `participants`
 * @param {{column?:string|null, dir?:string}} sort  column key ('first_name',
 *   'type', … or 'q:<questionId>' for an answer column); dir 'asc'|'desc'
 * @param {Array<{id:string}>} questions
 */
export function applyParticipantSort(q, sort, questions = []) {
  const asc = sort?.dir !== 'desc'
  const col = sort?.column
  // `id` is always the final tiebreaker so range-based pagination stays stable
  // even when the primary sort has ties.
  if (col && col.startsWith('q:')) {
    const qid = col.slice(2)
    if (questions.some((x) => x.id === qid)) {
      return q.order(`answers->>${qid}`, { ascending: asc }).order('id', { ascending: true })
    }
  }
  if (SORT_COLUMNS[col]) {
    for (const c of SORT_COLUMNS[col]) q = q.order(c, { ascending: asc })
    return q.order('id', { ascending: true })
  }
  // Default: newest first (the list's original behaviour).
  return q.order('created_at', { ascending: false }).order('id', { ascending: true })
}
