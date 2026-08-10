// @ts-check
/** Which questions a given participant sees, given their type and answers. */

import { evaluateVisibleIf } from './conditions.js'

/**
 * @param {import('./schema').Question} q
 * @param {string} participantTypeKey
 * @param {{audience?: 'registrant'|'admin'}} [options]
 */
export function appliesToType(q, participantTypeKey, options = {}) {
  if (q.archived) return false
  // An admin-only question is an organizer's private field (internal notes,
  // a room assignment). The registrant never sees it, and — because
  // validateParticipantAnswers prunes what is not visible — can never set it
  // either, which is the enforcement point for /api/register.
  if (q.adminOnly && options.audience !== 'admin') return false
  if (!Array.isArray(q.participantTypes) || q.participantTypes.length === 0) {
    return true
  }
  return q.participantTypes.includes(participantTypeKey)
}

/**
 * Questions visible to one participant right now: filtered by participant
 * type, then by conditional logic evaluated against their current answers.
 *
 * `audience` defaults to 'registrant', so every existing caller keeps the
 * safe behaviour and only screens that deliberately opt in see admin-only
 * questions.
 *
 * @param {import('./schema').FormDefinition} definition
 * @param {string} participantTypeKey
 * @param {Object.<string, *>} answers
 * @param {{audience?: 'registrant'|'admin'}} [options]
 * @returns {import('./schema').Question[]}
 */
export function visibleQuestions(definition, participantTypeKey, answers = {}, options = {}) {
  const typed = (definition?.questions ?? []).filter((q) =>
    appliesToType(q, participantTypeKey, options)
  )
  return typed.filter((q) => evaluateVisibleIf(answers, q.visibleIf))
}

/**
 * Re-attach admin-only answers that a registrant-audience validation pruned.
 *
 * update_own_participant overwrites `answers` wholesale, so without this a
 * registrant editing their own registration would erase every organizer-only
 * field on it. Only the self-service route needs this: /api/register has no
 * prior record, and the organizer route validates as 'admin' so the values
 * are already in its cleaned set.
 *
 * @param {import('./schema').FormDefinition} definition
 * @param {string} participantTypeKey
 * @param {Object.<string, *>} storedAnswers  what is currently on the row
 * @param {Object.<string, *>} cleaned        validated registrant-supplied answers
 * @returns {Object.<string, *>}
 */
export function preserveAdminAnswers(definition, participantTypeKey, storedAnswers, cleaned) {
  const merged = { ...(cleaned ?? {}) }
  for (const q of definition?.questions ?? []) {
    if (!q.adminOnly) continue
    if (storedAnswers && Object.prototype.hasOwnProperty.call(storedAnswers, q.id)) {
      merged[q.id] = storedAnswers[q.id]
    }
  }
  return merged
}
