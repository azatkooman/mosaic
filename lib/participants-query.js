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
 * @param {any} q PostgREST query builder for `participants`
 * @param {{status?:string, typeId?:string, search?:string, answerFilters?:Object,
 *   formVersionIds?:string[]|null}} f
 *   `formVersionIds` restricts the list to one registration bucket (individual
 *   vs group — see lib/event-questions). An empty array means the event has no
 *   forms in that bucket, which must return nothing rather than everything.
 * @param {Array<{id:string,type:string}>} questions
 */
export function applyParticipantFilters(q, f = {}, questions = []) {
  const { status, typeId, search, answerFilters, formVersionIds } = f
  if (Array.isArray(formVersionIds)) {
    // `.in()` with an empty list yields no rows, which is exactly right here.
    q = q.in('form_version_id', formVersionIds)
  }
  if (status) q = q.eq('status', status)
  if (typeId) q = q.eq('participant_type_id', typeId)
  if (search && search.trim()) {
    // .or() takes raw PostgREST syntax: commas separate clauses and
    // parentheses group them, so both must be stripped from user input.
    const s = search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ')
    // Profile name/email are included because a form need not ask for a name
    // or email at all — for those events the registrant's profile is the only
    // thing there is to search by.
    q = q.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,` +
        `profile_name.ilike.%${s}%,profile_email.ilike.%${s}%`
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
