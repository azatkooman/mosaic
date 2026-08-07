// @ts-check
/**
 * Built-in event-page labels, materialized into page_content so they can be
 * auto-translated.
 *
 * Sixteen strings on the event page have platform defaults: seven built-in
 * labels (the Register button, the countdown label and its four unit labels,
 * the View-agenda button) and the fallback heading of nine sections. The page
 * renders `lt(map, contentLocale, defaultLocale) || t(key)` for each, so an
 * untouched event falls through to the `event` i18n namespace — which only
 * covers the five platform locales. An event offered in an organizer-added
 * language (Thai, Tagalog, …) therefore showed those strings in the visitor's
 * UI language while everything around them was translated.
 *
 * Auto-translate could not fix that on its own: `targetNeedsTranslation`
 * requires source text to translate FROM, and these slots are empty until an
 * organizer types in them. Filling them turns the defaults into ordinary
 * translatable content.
 */

import { MT_KEY, hashSource } from './form-localization.js'

/**
 * Where each default lives in page_content, and the `event` message key it
 * comes from. The message key is the single source of truth for the wording —
 * seeding must never hardcode strings, or a seeded event would drift from an
 * unseeded one the moment a label is reworded.
 *
 * @type {ReadonlyArray<{section: string, field: string, message: string}>}
 */
export const DEFAULT_TEXT_FIELDS = [
  { section: 'theme', field: 'register_btn_text', message: 'register' },
  { section: 'hero', field: 'countdown_label', message: 'countdownLabel' },
  { section: 'hero', field: 'countdown_days_label', message: 'countdownDays' },
  { section: 'hero', field: 'countdown_hours_label', message: 'countdownHours' },
  { section: 'hero', field: 'countdown_minutes_label', message: 'countdownMinutes' },
  { section: 'hero', field: 'countdown_seconds_label', message: 'countdownSeconds' },
  { section: 'agenda', field: 'button_text', message: 'viewAgenda' },
  // Section headings. Same defect, same fix: an enabled section whose heading
  // the organizer never typed renders `t('<section>Default')`, so it stayed in
  // the reader's UI language on an event offered in a custom one.
  //
  // Testimonials is deliberately ABSENT. Its heading is the one that is truly
  // optional — sections-extra renders no heading at all when the slot is blank,
  // rather than falling back to `t('testimonialsDefault')`. Seeding it would
  // add a heading where the organizer chose to have none, which is a change to
  // the page, not a translation of it.
  { section: 'about', field: 'heading', message: 'aboutDefault' },
  { section: 'speakers', field: 'heading', message: 'speakersDefault' },
  { section: 'agenda', field: 'heading', message: 'agendaDefault' },
  { section: 'tickets', field: 'heading', message: 'ticketsDefault' },
  { section: 'contact', field: 'heading', message: 'contact' },
  { section: 'tracks', field: 'heading', message: 'tracksDefault' },
  { section: 'gallery', field: 'heading', message: 'galleryDefault' },
  { section: 'faq', field: 'heading', message: 'faqDefault' },
  { section: 'map', field: 'heading', message: 'mapDefault' },
]

const filled = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * Fill blank default-label slots in page_content.
 *
 * Every platform language is seeded, not just the source. Seeding the source
 * alone would REGRESS the others: with the slot blank the page falls through to
 * `t(key)` in the reader's own language, but once any text exists `lt()` falls
 * back to the default locale — so a Spanish reader would get the English
 * "Register" until (and unless) auto-translate ran. Seeding each platform
 * locale from its own catalog keeps them byte-for-byte what they render today,
 * and leaves only the custom languages for the translator to fill.
 *
 * The seeded non-source values are stamped against the source's hash, exactly
 * as `stampUntracked` would: they ARE derived from the source, so an organizer
 * who later reworder the source gets them refreshed. Without the stamp they
 * would read as hand-typed and be protected from retranslation forever.
 *
 * A slot whose source text the organizer already typed is left completely
 * alone — including its other languages, which are auto-translate's business.
 *
 * Returns the same object when nothing changed, so callers can detect a no-op
 * by reference (matching `normalizeStatValues` in the editor).
 *
 * @param {Object} pageContent          events.page_content
 * @param {string} source               the event's default_locale
 * @param {Object.<string, Object.<string, string>>} labels
 *   message key → locale → text, e.g. { register: { en: 'Register', es: '…' } }
 * @returns {Object}
 */
export function withDefaultLabels(pageContent, source, labels) {
  const content = pageContent ?? {}
  if (!source || !labels) return content

  let changed = false
  const next = { ...content }

  for (const { section, field, message } of DEFAULT_TEXT_FIELDS) {
    const byLocale = labels[message]
    const sourceText = byLocale?.[source]
    // No catalog entry for the source language — an event defaulting to a
    // custom language has no built-in wording to seed from, so it keeps the
    // existing t()-fallback behaviour rather than getting English text.
    if (!filled(sourceText)) continue

    const existing = next[section]?.[field]
    // The organizer typed their own wording; theirs wins, in every language.
    if (filled(existing?.[source])) continue

    const map = { ...(existing ?? {}) }
    const stamp = { ...(map[MT_KEY] ?? {}) }
    const hash = hashSource(sourceText)
    map[source] = sourceText

    for (const [locale, text] of Object.entries(byLocale)) {
      if (locale === source || !filled(text) || filled(map[locale])) continue
      map[locale] = text
      stamp[locale] = hash
    }

    if (Object.keys(stamp).length > 0) map[MT_KEY] = stamp
    next[section] = { ...(next[section] ?? {}), [field]: map }
    changed = true
  }

  return changed ? next : content
}
