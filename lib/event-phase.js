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
  if (closes != null && now > closes) return 'registrationClosed'
  if (opens != null && now < opens) return 'registrationNotOpen'
  return 'registrationOpen'
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
