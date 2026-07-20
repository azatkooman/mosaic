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

/** Format an ISO instant in the event's timezone for a given locale. */
export function formatEventDate(iso, timeZone, locale, opts = {}) {
  if (!iso) return ''
  const fmt = makeFormatter(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
    ...opts,
  })
  return fmt ? fmt.format(new Date(iso)) : new Date(iso).toISOString()
}

export function formatEventDateRange(startIso, endIso, timeZone, locale) {
  if (!startIso) return ''
  const fmt = makeFormatter(locale, { dateStyle: 'medium', timeZone })
  if (!fmt) return new Date(startIso).toISOString().slice(0, 10)
  return endIso ? fmt.formatRange(new Date(startIso), new Date(endIso)) : fmt.format(new Date(startIso))
}
