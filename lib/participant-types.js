// @ts-check
/**
 * Participant-type selection for the public registration form.
 *
 * Two related rules live here so the register page stays declarative and both
 * can be tested without a DOM:
 *   - which types the form offers (hidden ones are omitted unless deep-linked)
 *   - which type a `?type=` link preselects
 */

/**
 * Resolve a `?type=` parameter to a participant-type key.
 *
 * Matches on `key` first (readable, event-scoped-unique, and what the wizard
 * already keys on) and falls back to `id` so a link survives a renamed key.
 * Returns null — rather than 404ing — whenever the link cannot be honoured, so
 * a stale link degrades to the ordinary form instead of a dead end.
 *
 * A type needing more than one participant per registration is refused: the
 * deep link starts a single registration, which submit_registration would
 * reject with 'too few participants of type %'.
 *
 * @param {Array<{key: string, id?: string, min_per_registration?: number|null}>} types  registerable types only
 * @param {unknown} param
 * @returns {string|null} participant type key
 */
export function resolvePreselectedType(types, param) {
  if (typeof param !== 'string' || !param.trim()) return null
  const wanted = param.trim()
  const match =
    types.find((pt) => pt.key === wanted) ?? types.find((pt) => pt.id === wanted) ?? null
  if (!match) return null
  if ((match.min_per_registration ?? 0) > 1) return null
  return match.key
}

/**
 * The types the public form should list. A hidden type appears only when it is
 * the one being deep-linked — that is the entire point of hiding it.
 *
 * @param {Array<{key: string, hidden?: boolean}>} types
 * @param {string|null} [preselectedKey]
 * @returns {Array<object>}
 */
export function visibleParticipantTypes(types, preselectedKey = null) {
  return types.filter((pt) => !pt.hidden || pt.key === preselectedKey)
}
