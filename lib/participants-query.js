// @ts-check
/**
 * Shared filter + sort logic for the participants list AND the export, so a
 * download always matches exactly what the console table shows. Both callers
 * pass a PostgREST query builder (browser client for the table, service-role
 * client for the export) plus the same `questions` list; these helpers apply
 * the filters/order and return the builder.
 */

// Column key (from the UI) → real participants column to order by.
const SORT_COLUMNS = {
  first_name: 'first_name',
  last_name: 'last_name',
  email: 'email',
  type: 'participant_type_id', // groups participants by type
  status: 'status',
  created_at: 'created_at',
}

/**
 * @param {any} q PostgREST query builder for `participants`
 * @param {{status?:string, typeId?:string, search?:string, answerFilters?:Object}} f
 * @param {Array<{id:string,type:string}>} questions
 */
export function applyParticipantFilters(q, f = {}, questions = []) {
  const { status, typeId, search, answerFilters } = f
  if (status) q = q.eq('status', status)
  if (typeId) q = q.eq('participant_type_id', typeId)
  if (search && search.trim()) {
    // .or() takes raw PostgREST syntax: commas separate clauses and
    // parentheses group them, so both must be stripped from user input.
    const s = search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ')
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%`)
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
    return q.order(SORT_COLUMNS[col], { ascending: asc }).order('id', { ascending: true })
  }
  // Default: newest first (the list's original behaviour).
  return q.order('created_at', { ascending: false }).order('id', { ascending: true })
}
