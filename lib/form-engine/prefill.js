// @ts-check
/**
 * Seed a participant's answers from the registrant's account profile.
 * The inverse of identity.js: profile { full_name, email } → answers for the
 * first visible name/email question. Used to prefill the wizard when someone
 * registers themself; never overwrites answers the person already typed.
 * Dependency-free — mirrors identity.js.
 */

import { visibleQuestions } from './visibility.js'

const s = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * Split a single full-name string into first/last parts. Heuristic: the last
 * word is the last name, everything before it the first name. One word means
 * first name only.
 *
 * @param {string} fullName
 * @returns {{first: string, last: string}}
 */
function splitFullName(fullName) {
  const words = s(fullName).split(/\s+/).filter(Boolean)
  if (words.length === 0) return { first: '', last: '' }
  if (words.length === 1) return { first: words[0], last: '' }
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1] }
}

/**
 * @param {import('./schema').FormDefinition} definition
 * @param {string} participantTypeKey
 * @param {{full_name?: string|null, email?: string|null}|null|undefined} profile
 * @returns {Object.<string, *>} answers to seed a fresh participant with
 */
export function prefillIdentityAnswers(definition, participantTypeKey, profile) {
  const fullName = s(profile?.full_name)
  const email = s(profile?.email)
  if (!fullName && !email) return {}

  // Evaluate visibility against empty answers: only questions shown on a
  // fresh form are seeded, so conditional questions stay untouched.
  const visible = visibleQuestions(definition, participantTypeKey, {})
  /** @type {Object.<string, *>} */
  const answers = {}

  const nameQ = visible.find((q) => q.type === 'name')
  if (nameQ && fullName) {
    if ((nameQ.nameFormat ?? 'first_last') === 'full') {
      answers[nameQ.id] = { full: fullName }
    } else {
      const { first, last } = splitFullName(fullName)
      answers[nameQ.id] = { first, last }
    }
  }

  const emailQ = visible.find((q) => q.type === 'email')
  if (emailQ && email) answers[emailQ.id] = email

  return answers
}
