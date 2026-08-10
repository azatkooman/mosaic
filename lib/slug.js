// @ts-check
/**
 * Event slug generation, shared by "create event" and "duplicate event" so the
 * two cannot drift into producing different shapes.
 *
 * Split into a deterministic part and a suffixed part: `slugBase` is testable,
 * `uniqueSlug` is not (it reads the clock).
 */

/**
 * Slug body for a name: lowercased, accents stripped, non-alphanumerics folded
 * to single hyphens. Returns '' for a name with no latin characters at all
 * (e.g. "Конференция"), which callers replace with a fallback.
 *
 * @param {string} name
 * @returns {string}
 */
export function slugBase(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * A slug that will not collide: the base plus a short time-based suffix.
 * Non-latin names slugify to '' and fall back to 'event'.
 *
 * @param {string} name
 * @returns {string}
 */
export function uniqueSlug(name) {
  return `${slugBase(name) || 'event'}-${Date.now().toString(36)}`
}
