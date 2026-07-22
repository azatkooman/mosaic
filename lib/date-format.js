// Per-user date/time format preferences. 'auto' follows the UI language
// (Intl decides digit order and clock); explicit values force them.
// Mirrors lib/theme.js: the profiles row is the source of truth, a cookie
// carries the choice into SSR so the first paint is already correct.

export const DATE_FORMATS = ['auto', 'dmy', 'mdy', 'ymd']
export const TIME_FORMATS = ['auto', 'h12', 'h24']
export const DATEFMT_COOKIE = 'mosaic-datefmt'

export function normalizeDateFormat(value) {
  return DATE_FORMATS.includes(value) ? value : 'auto'
}

export function normalizeTimeFormat(value) {
  return TIME_FORMATS.includes(value) ? value : 'auto'
}

/** Cookie value "dmy.h24" → {dateFormat, timeFormat}; garbage-safe. */
export function parseDateFmtCookie(raw) {
  const [d, t] = typeof raw === 'string' ? raw.split('.') : []
  return { dateFormat: normalizeDateFormat(d), timeFormat: normalizeTimeFormat(t) }
}

/** {dateFormat, timeFormat} → "dmy.h24", or null when both are auto. */
export function serializeDateFmtCookie(prefs) {
  const d = normalizeDateFormat(prefs?.dateFormat)
  const t = normalizeTimeFormat(prefs?.timeFormat)
  return d === 'auto' && t === 'auto' ? null : `${d}.${t}`
}

/**
 * Persist the preference to the cookie the server reads on the next render.
 * Both-auto clears the cookie (absent = auto). Client-only.
 */
export function applyDateFormatClient(prefs) {
  const value = serializeDateFmtCookie(prefs)
  if (value === null) {
    document.cookie = `${DATEFMT_COOKIE}=; path=/; max-age=0; samesite=lax`
  } else {
    document.cookie = `${DATEFMT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
  }
}
