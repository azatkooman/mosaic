// @ts-check
/**
 * Derive a participant's stored identity (first_name / last_name / email
 * columns) from their form answers. Name and email are ordinary questions
 * since organizers may remove them; the first visible question of each type
 * is authoritative. Dependency-free — runs in the wizard and /api/register.
 */

import { visibleQuestions } from './visibility.js'

const s = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * @param {import('./schema').FormDefinition} definition
 * @param {string} participantTypeKey
 * @param {Object.<string, *>} answers
 * @returns {{firstName: string, lastName: string, email: string}}
 */
export function extractIdentity(definition, participantTypeKey, answers = {}) {
  const visible = visibleQuestions(definition, participantTypeKey, answers)
  let firstName = ''
  let lastName = ''
  let email = ''

  const nameQ = visible.find((q) => q.type === 'name')
  if (nameQ) {
    const v = answers[nameQ.id] ?? {}
    if ((nameQ.nameFormat ?? 'first_last') === 'full') {
      firstName = s(v.full)
    } else {
      // Middle name (when present) travels with the first name; the answers
      // JSONB keeps the exact parts for exports.
      firstName = [s(v.first), s(v.middle)].filter(Boolean).join(' ')
      lastName = s(v.last)
    }
  }

  const emailQ = visible.find((q) => q.type === 'email')
  if (emailQ) email = s(answers[emailQ.id])

  return { firstName, lastName, email }
}
