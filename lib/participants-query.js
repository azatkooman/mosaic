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

/** The statuses a participant can hold — the filter's full option set. */
export const PARTICIPANT_STATUSES = ['pending', 'confirmed', 'waitlisted', 'cancelled']

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
 * @param {any} q PostgREST query builder for `participants`
 * @param {{status?:string|string[], typeId?:string|string[], search?:string, answerFilters?:Object,
 *   formVersionIds?:string[]|null}} f
 *   `formVersionIds` restricts the list to one registration bucket (individual
 *   vs group — see lib/event-questions). An empty array means the event has no
 *   forms in that bucket, which must return nothing rather than everything.
 * @param {Array<{id:string,type:string}>} questions
 */
export function applyParticipantFilters(q, f = {}, questions = []) {
  const { status, typeId, search, answerFilters, formVersionIds } = f
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
    q = q.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,` +
        `profile_name.ilike.%${s}%,profile_email.ilike.%${s}%,` +
        `answers_text.ilike.%${s}%`
    )
  }
  for (const [qid, value] of Object.entries(answerFilters ?? {})) {
    if (value === '' || value == null) continue
    const question = questions.find((x) => x.id === qid)
    if (!question) continue // ignore unknown ids — guards the export URL params
    if (question.type === 'multiselect') q = q.contains('answers', { [qid]: [value] })
    else if (question.type === 'checkbox') q = q.contains('answers', { [qid]: value === 'true' })
    else if (question.type === 'select' || question.type === 'radio') q = q.eq(`answers->>${qid}`, value)
    else q = q.ilike(`answers->>${qid}`, `%${value}%`)
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
