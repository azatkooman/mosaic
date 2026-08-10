// @ts-check
import { LOCALES } from './i18n/locales'

/**
 * Public URL for an event page in a given content language.
 *
 * Only the five platform locales are real routes (`/es/events/slug`). Custom,
 * organizer-defined languages (e.g. 'th') are NOT routes: they ride on the
 * current platform locale via `?lang=` — putting them in the path yields
 * `/en/th/events/slug`, which 404s.
 *
 * @param {object} args
 * @param {string} args.slug        event slug
 * @param {string} [args.code]      content language to open (platform or custom)
 * @param {string} [args.uiLocale]  platform locale to use for custom languages
 * @param {string} [args.origin]    absolute origin; omit for a relative URL
 * @param {string} [args.subPath]   e.g. '/register' — appended before the query
 * @param {Object.<string,string>} [args.params] extra query params (e.g. {type: 'staff'})
 * @returns {string}
 */
export function eventPageUrl({ slug, code, uiLocale = 'en', origin = '', subPath = '', params }) {
  const base = origin || ''
  const query = new URLSearchParams()
  // A platform locale owns its own route; anything else is a custom language
  // and has to ride ?lang= on the current locale's route.
  const isPlatform = code && LOCALES.includes(code)
  const routeLocale = isPlatform ? code : LOCALES.includes(uiLocale) ? uiLocale : 'en'
  if (!isPlatform && code) query.set('lang', code)
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v != null && v !== '') query.set(k, String(v))
  }
  const path = `${base}/${routeLocale}/events/${slug}${subPath}`
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Add or replace one query param on an href that may already carry a query
 * (event links routinely arrive with ?lang= attached).
 *
 * @param {string} href
 * @param {string} key
 * @param {string|null|undefined} value  falsy removes the param
 * @returns {string}
 */
export function withParam(href, key, value) {
  const [path, hash = ''] = String(href).split('#')
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  if (value == null || value === '') params.delete(key)
  else params.set(key, String(value))
  const qs = params.toString()
  return `${base}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`
}

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

/**
 * Short-lived cookie carrying the post-login destination across the auth
 * provider round trip.
 *
 * It does not ride in the `redirectTo` query string because Supabase matches
 * `redirectTo` against the project's Redirect URL allow-list *including* the
 * query string: a miss silently falls back to Site URL and the destination is
 * lost. Not a secret and deliberately not HttpOnly — the login form sets it
 * from the browser before handing off to the provider.
 */
export const AUTH_NEXT_COOKIE = 'mosaic-auth-next'

// Control characters would let a crafted value break the Location header.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * Validate a post-login redirect target, falling back when it is not a
 * same-origin path.
 *
 * "//evil.com" passes a naive startsWith('/') check yet sends the browser
 * off-site, so protocol-relative values are rejected — as are the "/\evil.com"
 * backslash variants browsers normalise to the same thing.
 *
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
export function safeNextPath(value, fallback) {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/')) return fallback
  if (value[1] === '/' || value[1] === '\\') return fallback
  if (CONTROL_CHARS.test(value)) return fallback
  return value
}
