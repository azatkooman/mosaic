/**
 * Lifecycle phase of a published event, derived from its dates.
 * Phases: registrationNotOpen → registrationOpen → registrationClosed →
 * inProgress → ended. Label strings live in the eventPhase i18n namespace;
 * badge tones map onto the existing badge palette.
 */
export function eventPhase(event, now = Date.now()) {
  const opens = event.registration_opens_at ? Date.parse(event.registration_opens_at) : null
  const closes = event.registration_closes_at ? Date.parse(event.registration_closes_at) : null
  const starts = event.starts_at ? Date.parse(event.starts_at) : null
  const ends = event.ends_at ? Date.parse(event.ends_at) : null

  if (ends != null && now > ends) return 'ended'
  if (starts != null && now >= starts) return 'inProgress'
  // The organizer's kill-switch sits with the window, not above it: a finished
  // event still reads 'ended' rather than 'closed'.
  if (event.registration_manually_closed) return 'registrationClosed'
  if (closes != null && now > closes) return 'registrationClosed'
  if (opens != null && now < opens) return 'registrationNotOpen'
  return 'registrationOpen'
}

/**
 * Where registration stands right now, by its own dates and the organizer's
 * switch only (unlike eventPhase, the event's start and end do not enter
 * into it). The switch closes registration regardless of the dates, and
 * `closed` is reported even when the window has not opened yet.
 */
export function registrationWindow(event, now = Date.now()) {
  const opens = event.registration_opens_at ? Date.parse(event.registration_opens_at) : null
  const closes = event.registration_closes_at ? Date.parse(event.registration_closes_at) : null
  return {
    notOpenYet: opens != null && now < opens,
    closed: Boolean(event.registration_manually_closed) || (closes != null && now > closes),
  }
}

export const EVENT_PHASE_TONES = {
  registrationNotOpen: 'pending',
  registrationOpen: 'confirmed',
  // 'cancelled' (red), not 'waitlisted': the amber waitlist tone is nearly
  // indistinguishable from the gold 'pending' badge in dark mode.
  registrationClosed: 'cancelled',
  inProgress: 'published',
  ended: 'archived',
}
