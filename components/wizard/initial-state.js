// @ts-check
import { prefillIdentityAnswers } from '@/lib/form-engine/prefill'

/**
 * Opening state for the registration wizard.
 *
 * Extracted as a pure function for two reasons: a deep link has to be applied
 * in the useState initializers (applying it in an effect makes the mode step
 * flash before it is replaced), and there is no jsdom in this project, so the
 * only way to test the branching is to keep it out of the component.
 *
 * @param {object} args
 * @param {Array<{key: string, definition?: object|null}>} args.participantTypes
 * @param {string|null} [args.preselectedTypeKey]
 * @param {object|null} [args.profile]
 * @param {Object.<string, object>} [args.modeForms]
 * @returns {{step: string, mode: string|null, singleTypeKey: string|null, counts: Object.<string,number>, people: Array<object>, personIndex: number}}
 */
export function initialWizardState({
  participantTypes,
  preselectedTypeKey = null,
  profile = null,
  modeForms = {},
}) {
  const counts = Object.fromEntries(participantTypes.map((pt) => [pt.key, 0]))
  const base = {
    step: 'mode',
    mode: null,
    singleTypeKey: null,
    counts,
    people: [],
    personIndex: 0,
  }

  const pt = preselectedTypeKey
    ? participantTypes.find((x) => x.key === preselectedTypeKey)
    : null
  if (!pt) return base

  // A link that names a type answers both of the first two questions: it is a
  // single registration, of that type. Drop the reader straight onto the form.
  const definition = modeForms?.single ?? pt.definition ?? { questions: [] }
  return {
    step: 'person',
    mode: 'single',
    singleTypeKey: pt.key,
    counts: { ...counts, [pt.key]: 1 },
    people: [
      {
        participantTypeKey: pt.key,
        answers: prefillIdentityAnswers(definition, pt.key, profile),
      },
    ],
    personIndex: 0,
  }
}

/**
 * Should a saved draft replace the deep link's opening state?
 *
 * A draft for the same type is the reader's own half-finished form — restore
 * it. A draft for a different type is stale relative to the link they just
 * followed, so the link wins and the draft is discarded.
 *
 * @param {{singleTypeKey?: string|null}|null} draft
 * @param {string|null} preselectedTypeKey
 * @returns {boolean}
 */
export function draftWinsOverLink(draft, preselectedTypeKey) {
  if (!preselectedTypeKey) return true
  return draft?.singleTypeKey === preselectedTypeKey
}
