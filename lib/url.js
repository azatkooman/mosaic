// @ts-check
// Only these schemes may appear in user-entered links rendered to the public.
const ALLOWED_SCHEME = /^(https?|mailto|tel):/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Turn a user-entered website value into a safe, absolute href.
 *
 * A bare domain like "cru.org" is otherwise treated as a path relative to the
 * current page (so it gets the console/event URL prefixed); prepend https://
 * when no scheme is present. Schemes other than http(s)/mailto/tel (e.g.
 * javascript:, data:) are rejected. Returns null for empty/unsafe input so
 * callers can skip rendering the link.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function externalHref(value) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (HAS_SCHEME.test(v)) return ALLOWED_SCHEME.test(v) ? v : null
  if (v.startsWith('//')) return `https:${v}` // protocol-relative
  return `https://${v}`
}
