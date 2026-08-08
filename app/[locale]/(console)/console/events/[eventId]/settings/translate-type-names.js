// @ts-check
/**
 * Auto-translate participant type names.
 *
 * Participant type names are ordinary localized content — `participant_types.name`
 * is a locale map (`{en: 'Staff', es: 'Personal'}`), the same shape as the event
 * page's text — but they live in their own table, so they were never part of the
 * event-page editor's `{name, description, location, page_content}` bundle and
 * nothing ever translated them. On an event offered in an organizer-added
 * language the whole registration flow translated except the one label naming
 * who the registrant is.
 *
 * Nothing here is new machinery: `retranslateDocument` walks any locale map in
 * any tree, and /api/translate-event takes `{requests, source}` with nothing
 * event-specific about it. This is the wiring.
 *
 * Extracted from the settings form so the decisions — what counts as stale, what
 * is left alone — are testable without a DOM, which this project has no jsdom to
 * provide.
 */

import { retranslateDocument } from '@/lib/form-localization'

/**
 * Fill in every language for each type name, from the event's default language.
 *
 * Translating FROM `source` (the event's default locale) is what makes this
 * safe despite the settings form editing `name[locale]` keyed on the CONSOLE
 * locale: an organizer working in a Spanish console types into `name.es`, which
 * is a hand translation and stays protected forever because it carries no
 * provenance stamp. Only text in the default language is ever a source, and only
 * when it has actually changed since the last run — so renaming a type in a
 * non-default language correctly translates nothing, and a capacity-only edit
 * costs no API call at all.
 *
 * @param {Array<{name?: Object}>} types  participant types, in save order
 * @param {object} opts
 * @param {string} opts.source            the event's default_locale
 * @param {string[]} opts.locales         every language the event offers
 * @param {(requests: Object) => Promise<Object>} opts.translate
 * @returns {Promise<{types: Array<Object>, changed: boolean, translated: number}>}
 *   `types` is the same array when nothing changed, so the caller can skip the
 *   write entirely.
 */
export async function translateTypeNames(types, { source, locales, translate }) {
  const targets = (locales ?? []).filter((l) => l && l !== source)
  if (!source || targets.length === 0 || !types?.length) {
    return { types, changed: false, translated: 0 }
  }

  // Wrapped in an object rather than passed as a bare array so the walker sees a
  // document, and indexes line up with `types` on the way back out.
  const bundle = { names: types.map((pt) => pt.name ?? {}) }

  const { node, changed, translated } = await retranslateDocument(bundle, {
    source,
    targets,
    // The event's FULL language set, not just this run's targets — otherwise
    // stampUntracked leaves the other languages unstamped inside an already
    // stamped map, which reads as hand-authored and would freeze them.
    locales,
    translate,
  })

  if (!changed) return { types, changed: false, translated }

  return {
    types: types.map((pt, index) => ({ ...pt, name: node.names[index] })),
    changed: true,
    translated,
  }
}
