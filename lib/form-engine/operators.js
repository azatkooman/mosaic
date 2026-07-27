// @ts-check
/**
 * Which comparison operators an organizer may pick for a visibility rule, and
 * how each one is labelled.
 *
 * Two problems this solves. First, the builder used to render the raw engine
 * keys ("neq", "notIn", "gte") straight into a dropdown, which reads like
 * source code rather than a sentence. Second, it offered all eleven operators
 * for every question type, including combinations the engine can never satisfy
 * — `eq` on a multiselect is rejected outright by evaluateRule (it refuses
 * array answers), so the rule silently never matched.
 *
 * Both lists below are therefore derived from what `evaluateRule` in
 * conditions.js actually does. Keep them in step with it.
 */

/** Answers stored as an object; only presence can be tested meaningfully. */
const PRESENCE_ONLY = ['isEmpty', 'isNotEmpty']

const TEXTUAL = ['eq', 'neq', 'contains', 'in', 'notIn', 'isEmpty', 'isNotEmpty']
const ORDERED = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty']
const CHOICE = ['eq', 'neq', 'in', 'notIn', 'isEmpty', 'isNotEmpty']

/**
 * Operators offered per question type, in the order they appear in the menu.
 * @type {Object.<string, string[]>}
 */
export const OPERATORS_BY_TYPE = {
  text: TEXTUAL,
  textarea: TEXTUAL,
  email: TEXTUAL,
  file: PRESENCE_ONLY,
  // Object-valued answers ({first,last}, {code,number}, address parts).
  name: PRESENCE_ONLY,
  phone: PRESENCE_ONLY,
  address: PRESENCE_ONLY,
  number: [...ORDERED.slice(0, 6), 'in', 'notIn', 'isEmpty', 'isNotEmpty'],
  date: ORDERED,
  select: CHOICE,
  radio: CHOICE,
  // evaluateRule's eq/neq/in/notIn all stringify the answer, so they are
  // useless against a multiselect's array — `contains` is the real test.
  multiselect: ['contains', 'isEmpty', 'isNotEmpty'],
  // A false checkbox counts as empty, so presence IS checked/unchecked.
  checkbox: ['isNotEmpty', 'isEmpty'],
}

/** Fallback for an unrecognised type — the safest, always-valid pair. */
const DEFAULT_OPERATORS = PRESENCE_ONLY

/**
 * Operators to offer for a question type. `current` is always included even
 * when the type would not normally offer it, so opening an existing rule can
 * never silently rewrite it.
 *
 * @param {string} [type]
 * @param {string} [current]
 * @returns {string[]}
 */
export function operatorsForType(type, current) {
  const list = OPERATORS_BY_TYPE[type ?? ''] ?? DEFAULT_OPERATORS
  return current && !list.includes(current) ? [...list, current] : [...list]
}

/**
 * True when `operator` is a sensible choice for `type` — used to re-point a
 * rule when the organizer switches which question it watches.
 *
 * @param {string} operator
 * @param {string} [type]
 */
export function isOperatorAllowed(operator, type) {
  return (OPERATORS_BY_TYPE[type ?? ''] ?? DEFAULT_OPERATORS).includes(operator)
}

/** The operator to fall back to when the current one no longer applies. */
export function defaultOperatorFor(type) {
  return (OPERATORS_BY_TYPE[type ?? ''] ?? DEFAULT_OPERATORS)[0]
}

/**
 * Type-specific wordings. "after" beats "greater than" for a date, and
 * "checked" beats "is not empty" for a checkbox.
 * @type {Object.<string, Object.<string, string>>}
 */
const LABEL_OVERRIDES = {
  date: { gt: 'gtDate', gte: 'gteDate', lt: 'ltDate', lte: 'lteDate' },
  multiselect: { contains: 'containsMultiselect' },
  checkbox: { isEmpty: 'isEmptyCheckbox', isNotEmpty: 'isNotEmptyCheckbox' },
  file: { isEmpty: 'isEmptyFile', isNotEmpty: 'isNotEmptyFile' },
}

/**
 * Key into the `operators` message namespace for this operator/type pair.
 *
 * @param {string} operator
 * @param {string} [type]
 * @returns {string}
 */
export function operatorLabelKey(operator, type) {
  return LABEL_OVERRIDES[type ?? '']?.[operator] ?? operator
}
