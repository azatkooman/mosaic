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

/** Format an ISO instant in the event's timezone for a given locale. */
export function formatEventDate(iso, timeZone, locale, opts = {}) {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
    ...opts,
  }).format(new Date(iso))
}

export function formatEventDateRange(startIso, endIso, timeZone, locale) {
  if (!startIso) return ''
  const fmt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone,
  })
  return endIso ? fmt.formatRange(new Date(startIso), new Date(endIso)) : fmt.format(new Date(startIso))
}

/** Short label for a timezone at a given instant, e.g. "GMT+7". Returns '' if
 *  the timezone is falsy or invalid. */
export function timeZoneLabel(iso, timeZone, locale) {
  if (!timeZone || !iso) return ''
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date(iso))
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    // Invalid IANA name stored on the profile — fall back to no label.
    return ''
  }
}
