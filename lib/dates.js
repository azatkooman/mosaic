/** Render a stored UTC instant as a datetime-local value in the given timezone. */
export function toLocalInput(iso, timeZone) {
  if (!iso) return ''
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Interpret a datetime-local value as wall-clock time in the given timezone → UTC ISO. */
export function fromLocalInput(value, timeZone) {
  if (!value) return null
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  // Adjust for the timezone's offset at that moment (two-pass, DST-safe enough)
  const tzDate = new Date(guess.toLocaleString('en-US', { timeZone }))
  const utcDate = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offset = utcDate.getTime() - tzDate.getTime()
  return new Date(guess.getTime() + offset).toISOString()
}

// A bad timezone/locale on a single event must never crash the page that
// lists it. Fall back to UTC (then to no timezone) instead of throwing.
function makeFormatter(locale, options) {
  try {
    return new Intl.DateTimeFormat(locale, options)
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    } catch {
      const { timeZone, ...rest } = options
      try {
        return new Intl.DateTimeFormat(undefined, rest)
      } catch {
        return null
      }
    }
  }
}

// --- Per-user format overrides ---------------------------------------------
// 'auto' = the locale decides (Intl dateStyle/timeStyle — today's behaviour).
// Forced orders (dmy/mdy/ymd) are assembled from formatToParts IN THE USER'S
// LOCALE so the day-period stays localized (uk «пп», es «p. m.») — never via
// locale surrogates like en-GB. Forced output is numeric-only, so localized
// month names are not a concern.

/** h12 → true, h24 → false, auto → the locale's own convention. */
function resolveHour12(timeFormat, locale) {
  if (timeFormat === 'h12') return true
  if (timeFormat === 'h24') return false
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  } catch {
    return false
  }
}

/** formatToParts for a forced layout; null when even the fallbacks fail. */
function forcedParts(date, timeZone, locale, { withTime, hour12 }) {
  const options = {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime
      ? hour12
        ? { hour: 'numeric', minute: '2-digit', hour12: true }
        : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : {}),
  }
  const fmt = makeFormatter(locale, options)
  if (!fmt) return null
  const parts = fmt.formatToParts(date)
  return (type) => parts.find((p) => p.type === type)?.value ?? ''
}

function assembleDate(get, dateFormat) {
  const d = get('day')
  const m = get('month')
  const y = get('year')
  if (dateFormat === 'mdy') return `${m}/${d}/${y}`
  if (dateFormat === 'ymd') return `${y}-${m}-${d}`
  return `${d}/${m}/${y}`
}

function assembleTime(get, hour12) {
  const base = `${get('hour')}:${get('minute')}`
  const period = hour12 ? get('dayPeriod') : ''
  return period ? `${base} ${period}` : base
}

/**
 * Format an ISO instant in the event's timezone for a given locale.
 * opts may carry {dateFormat, timeFormat} user preferences; any other keys
 * are spread into the Intl options of the auto path (backward compatible).
 */
export function formatEventDate(iso, timeZone, locale, opts = {}) {
  if (!iso) return ''
  const { dateFormat = 'auto', timeFormat = 'auto', ...intlOpts } = opts
  const date = new Date(iso)

  if (dateFormat === 'auto') {
    const clock =
      timeFormat === 'h12' ? { hour12: true } : timeFormat === 'h24' ? { hourCycle: 'h23' } : {}
    const fmt = makeFormatter(locale, {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
      ...clock,
      ...intlOpts,
    })
    return fmt ? fmt.format(date) : date.toISOString()
  }

  const hour12 = resolveHour12(timeFormat, locale)
  const get = forcedParts(date, timeZone, locale, { withTime: true, hour12 })
  if (!get) return date.toISOString()
  return `${assembleDate(get, dateFormat)}, ${assembleTime(get, hour12)}`
}

/** Date-only range. prefs may carry {dateFormat} (time never shown here). */
export function formatEventDateRange(startIso, endIso, timeZone, locale, prefs = {}) {
  if (!startIso) return ''
  const dateFormat = prefs.dateFormat ?? 'auto'
  const start = new Date(startIso)

  if (dateFormat === 'auto') {
    const fmt = makeFormatter(locale, { dateStyle: 'medium', timeZone })
    if (!fmt) return start.toISOString().slice(0, 10)
    return endIso ? fmt.formatRange(start, new Date(endIso)) : fmt.format(start)
  }

  const startGet = forcedParts(start, timeZone, locale, { withTime: false })
  if (!startGet) return start.toISOString().slice(0, 10)
  const startText = assembleDate(startGet, dateFormat)
  if (!endIso) return startText
  const endGet = forcedParts(new Date(endIso), timeZone, locale, { withTime: false })
  if (!endGet) return startText
  const endText = assembleDate(endGet, dateFormat)
  // Same calendar day in the event timezone → single date.
  return endText === startText ? startText : `${startText} – ${endText}`
}

/**
 * Format a date-only answer value ('YYYY-MM-DD') per the viewer's date
 * preference. Interpreted in UTC so the calendar day never shifts. Used for
 * date-type form answers so they render in each viewer's chosen format.
 */
export function formatDateValue(value, locale, prefs = {}) {
  if (typeof value !== 'string' || value === '') return ''
  return formatEventDateRange(value, null, 'UTC', locale, { dateFormat: prefs?.dateFormat })
}

/**
 * Format a datetime-local input value ('YYYY-MM-DDTHH:mm', naive wall-clock)
 * per the viewer's date + time preference, WITHOUT any timezone conversion
 * (the value is already local wall-clock). Used to display native
 * datetime-local inputs in the user's chosen format.
 */
export function formatLocalInput(value, locale, prefs = {}) {
  if (typeof value !== 'string' || !value) return ''
  const [datePart, timePart = ''] = value.split('T')
  const [y, mo, d] = datePart.split('-')
  if (!y || !mo || !d) return value
  const dateFormat = prefs?.dateFormat ?? 'auto'
  const timeFormat = prefs?.timeFormat ?? 'auto'
  const [hStr, minStr = '00'] = timePart.split(':')
  const local = new Date(Number(y), Number(mo) - 1, Number(d), Number(hStr || 0), Number(minStr || 0))
  const valid = !Number.isNaN(local.getTime())

  let dateText
  if (dateFormat === 'mdy') dateText = `${mo}/${d}/${y}`
  else if (dateFormat === 'dmy') dateText = `${d}/${mo}/${y}`
  else if (dateFormat === 'ymd') dateText = `${y}-${mo}-${d}`
  else dateText = valid
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(local)
    : `${y}-${mo}-${d}`

  if (!timePart) return dateText
  let timeText
  if (timeFormat === 'h24') timeText = `${String(hStr).padStart(2, '0')}:${minStr}`
  else if (timeFormat === 'h12') {
    const hn = Number(hStr)
    const ap = hn < 12 ? 'AM' : 'PM'
    const h12 = ((hn + 11) % 12) + 1
    timeText = `${h12}:${minStr} ${ap}`
  } else timeText = valid
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(local)
    : `${hStr}:${minStr}`

  return `${dateText} ${timeText}`
}

/**
 * Placeholder pattern (e.g. 'DD/MM/YYYY' or 'DD/MM/YYYY, HH:MM AM') for a
 * date / datetime-local field, reflecting the user's format preference.
 */
export function dateInputPattern(type, prefs = {}, locale = 'en') {
  const d = prefs?.dateFormat ?? 'auto'
  const datePat =
    d === 'mdy' ? 'MM/DD/YYYY'
    : d === 'dmy' ? 'DD/MM/YYYY'
    : d === 'ymd' ? 'YYYY-MM-DD'
    : patternFromParts(locale, { year: 'numeric', month: '2-digit', day: '2-digit' },
        { year: 'YYYY', month: 'MM', day: 'DD' }, 'YYYY-MM-DD')
  if (type !== 'datetime-local') return datePat
  const t = prefs?.timeFormat ?? 'auto'
  const timePat =
    t === 'h12' ? 'HH:MM AM'
    : t === 'h24' ? 'HH:MM'
    : patternFromParts(locale, { hour: '2-digit', minute: '2-digit' },
        { hour: 'HH', minute: 'MM', dayPeriod: 'AM' }, 'HH:MM')
  return `${datePat}, ${timePat}`
}

function patternFromParts(locale, options, map, fallback) {
  try {
    const parts = new Intl.DateTimeFormat(locale, options).formatToParts(new Date(2026, 11, 31, 13, 5))
    return parts.map((p) => map[p.type] ?? p.value).join('')
  } catch {
    return fallback
  }
}

// Fixed sample instant for preference option labels (localized live).
const SAMPLE_ISO = '2026-12-31T14:30:00Z'

export function formatSampleDate(dateFormat, locale) {
  return formatEventDateRange(SAMPLE_ISO, null, 'UTC', locale, { dateFormat })
}

export function formatSampleTime(timeFormat, locale) {
  if (timeFormat === 'auto') {
    const fmt = makeFormatter(locale, { timeStyle: 'short', timeZone: 'UTC' })
    return fmt ? fmt.format(new Date(SAMPLE_ISO)) : '14:30'
  }
  const hour12 = timeFormat === 'h12'
  const get = forcedParts(new Date(SAMPLE_ISO), 'UTC', locale, { withTime: true, hour12 })
  return get ? assembleTime(get, hour12) : '14:30'
}
