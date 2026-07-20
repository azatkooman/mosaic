// @ts-check
/**
 * Human-readable text for structured (object-valued) answers — name,
 * address, phone. Shared by the console participants table and the
 * export routes so both render identically. Dependency-free.
 */

import { addressParts } from './address.js'

const s = (v, key) => (typeof v?.[key] === 'string' ? v[key].trim() : '')

/**
 * @param {import('./schema').Question} q
 * @param {*} value
 * @returns {string|null} formatted text, or null when the type isn't structured
 */
export function formatStructuredAnswer(q, value) {
  if (value == null) return ''
  switch (q.type) {
    case 'name': {
      if (typeof value !== 'object') return String(value)
      return (
        s(value, 'full') ||
        [s(value, 'first'), s(value, 'middle'), s(value, 'last')].filter(Boolean).join(' ')
      )
    }
    case 'address': {
      if (typeof value !== 'object') return String(value)
      return addressParts(q)
        .map((p) => s(value, p.key))
        .filter(Boolean)
        .join(', ')
    }
    case 'phone': {
      if (typeof value === 'string') return value
      if (typeof value !== 'object') return String(value)
      return [s(value, 'code'), s(value, 'number')].filter(Boolean).join(' ')
    }
    default:
      return null
  }
}
