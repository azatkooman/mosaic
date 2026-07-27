// @ts-check
/** Conditional-visibility rule evaluation. Pure functions, no dependencies. */

function isEmptyAnswer(v) {
  if (v == null || v === '' || v === false) return true
  if (Array.isArray(v)) return v.length === 0
  // Composite answers (name {first,last}, phone {code,number}, address parts)
  // arrive as objects. An untouched one is `{}` or all-blank parts — without
  // this it counted as filled, so isEmpty never matched and isNotEmpty always
  // did, which is the only presence test those types can express.
  if (typeof v === 'object') return Object.values(v).every(isEmptyAnswer)
  return false
}

function toComparable(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && !Number.isNaN(n) ? n : v
}

/**
 * @param {*} answer  The stored answer for the referenced question.
 * @param {import('./schema').Rule} rule
 * @returns {boolean}
 */
export function evaluateRule(answer, rule) {
  const { operator, value } = rule
  switch (operator) {
    case 'isEmpty':
      return isEmptyAnswer(answer)
    case 'isNotEmpty':
      return !isEmptyAnswer(answer)
    case 'eq':
      return !Array.isArray(answer) && String(answer ?? '') === String(value)
    case 'neq':
      return !Array.isArray(answer) && String(answer ?? '') !== String(value)
    case 'in':
      return Array.isArray(value) && value.map(String).includes(String(answer ?? ''))
    case 'notIn':
      return Array.isArray(value) && !value.map(String).includes(String(answer ?? ''))
    case 'contains':
      // multiselect answers: does the selection include value?
      if (Array.isArray(answer)) return answer.map(String).includes(String(value))
      return typeof answer === 'string' && answer.includes(String(value))
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toComparable(answer)
      const b = toComparable(value)
      if (a == null || a === '' || (typeof a !== typeof b)) return false
      if (operator === 'gt') return a > b
      if (operator === 'gte') return a >= b
      if (operator === 'lt') return a < b
      return a <= b
    }
    default:
      return false
  }
}

/**
 * @param {Object.<string, *>} answers  Answer map for ONE participant.
 * @param {import('./schema').RuleGroup|undefined|null} group
 * @returns {boolean}  true when the question should be shown.
 */
export function evaluateVisibleIf(answers, group) {
  if (!group || !Array.isArray(group.rules) || group.rules.length === 0) {
    return true
  }
  const results = group.rules.map((r) => evaluateRule(answers?.[r.questionId], r))
  return group.op === 'or' ? results.some(Boolean) : results.every(Boolean)
}
