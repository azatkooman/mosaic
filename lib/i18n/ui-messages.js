// @ts-check
/**
 * Platform UI text for organizer-added languages.
 *
 * Two kinds of text meet on a registration page. Event text (the event name,
 * participant type names, question labels) is authored per event, lives in
 * locale maps, and is translated per event — that already worked. Platform text
 * ("Next", "Single registration", "First name", "Country code") is authored by
 * us, is identical for every event, and lives in `messages/{locale}.json`.
 *
 * Platform text ships in five locales. A built-in language owns a route
 * (`/es/...`) so next-intl resolves it; a custom language cannot be a route and
 * rides `?lang=th` on the current route locale (see lib/url.js), so the reader
 * got translated event text wrapped in untranslated chrome.
 *
 * This module is the pure half of the fix: which keys are worth translating,
 * how to flatten/rebuild them, which have gone stale, and how to merge a
 * cached language over a platform catalog. The DB read lives in
 * ./ui-messages-server.js and the write in /api/ui-translations.
 *
 * Dependency-free apart from `hashSource`, so it runs in tests, in the route
 * handler and in the browser alike.
 */

import { hashSource } from '../form-localization.js'

/**
 * Namespaces an attendee can actually see, and therefore the only ones worth
 * paying to translate.
 *
 * `console` is deliberately absent: it is 558 of the catalog's 758 keys and is
 * read only by organizers, who work in one of the five platform locales.
 * Including it would quadruple both the API cost and the stored bytes to no
 * end, and would push a single run past the translate route's per-target cap.
 *
 * `profile`, `auth`, `nav` and `home` are absent for a softer reason: they are
 * account-level surfaces reached from the site chrome, not steps of a
 * registration, and they are navigated in the reader's own route locale where
 * the hand-written catalog already applies. Adding one later is a one-line
 * change here — the mechanism does not care how long this list is.
 *
 * @type {ReadonlyArray<string>}
 */
export const UI_NAMESPACES = [
  'wizard', // the registration wizard: every step, review, confirmation
  'common', // Next / Back / Edit / Cancel — the buttons those steps use
  'runtime', // name, address and phone sub-labels inside a question
  'validation', // the error under a field that failed
  'myRegs', // where the wizard sends them afterwards
  'status', // confirmed / waitlisted / cancelled badges
  'ticket', // the participant ticket
  'event', // the public event page's own chrome (registrationClosed, backToHome)
]

/**
 * The language the platform catalog is authored in. Machine translation always
 * runs from here, never from the event's default locale: the other four
 * platform catalogs are hand translations of this one, so translating Thai from
 * Spanish would be a translation of a translation.
 */
export const UI_SOURCE_LOCALE = 'en'

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/**
 * Reduce a full message catalog to the attendee namespaces.
 * @param {Object} catalog  a parsed messages/{locale}.json
 * @returns {Object}
 */
export function pickUiMessages(catalog) {
  const out = {}
  for (const ns of UI_NAMESPACES) {
    if (isPlainObject(catalog?.[ns])) out[ns] = catalog[ns]
  }
  return out
}

/**
 * Flatten a message tree to `{ 'wizard.modeTitle': 'Is this…' }`.
 *
 * Dotted paths are what next-intl already uses to address a nested key, and a
 * flat map is what both the translate call (a list of strings) and the hash
 * bookkeeping want. Only strings are collected; anything else is skipped.
 *
 * @param {Object} tree
 * @param {string} [prefix]
 * @returns {Object.<string, string>}
 */
export function flattenMessages(tree, prefix = '') {
  const out = {}
  if (!isPlainObject(tree)) return out
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else if (isPlainObject(value)) Object.assign(out, flattenMessages(value, path))
  }
  return out
}

/**
 * Rebuild a tree from dotted paths. Inverse of `flattenMessages`.
 * @param {Object.<string, string>} flat
 * @returns {Object}
 */
export function unflattenMessages(flat) {
  const out = {}
  for (const [path, value] of Object.entries(flat ?? {})) {
    const parts = path.split('.')
    let node = out
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isPlainObject(node[parts[i]])) node[parts[i]] = {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = value
  }
  return out
}

/**
 * ICU placeholders in a string: `"Register for {event}"` → `['event']`.
 *
 * Five catalog strings interpolate (`{event}`, `{index}`, `{total}`, `{name}`,
 * `{date}`) and none uses plural/select syntax, so a flat token scan is enough.
 */
export function placeholdersOf(text) {
  if (typeof text !== 'string') return []
  return [...text.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*\}/g)].map((m) => m[1]).sort()
}

/**
 * Did a translation keep every placeholder the source had?
 *
 * Google is asked for `format: 'text'` and usually passes braces through
 * untouched, but "usually" is not good enough here: next-intl parses these
 * strings as ICU, so a translated `{Event}`, `{ event }` or a dropped brace
 * turns a working label into a runtime error. A translation that fails this is
 * discarded, and the key then falls back to the platform catalog — a string in
 * the wrong language, which is merely the bug we started with, rather than a
 * broken page.
 */
export function placeholdersIntact(source, translated) {
  const want = placeholdersOf(source)
  const got = placeholdersOf(translated)
  return want.length === got.length && want.every((p, i) => p === got[i])
}

/**
 * Which keys need (re)translating for a language.
 *
 * A key is stale when it has no cached text, when it has no recorded source
 * hash, or when the recorded hash no longer matches the English source — i.e.
 * we reworded the string since. That last case is why the hashes are stored per
 * key rather than as one hash of the whole set: rewording one label costs one
 * string on the next run, not the whole catalog.
 *
 * @param {Object.<string, string>} sourceFlat   flattened English messages
 * @param {Object} cached  the stored row: { messages, source_hashes }
 * @returns {string[]} dotted paths, in catalog order
 */
export function staleUiKeys(sourceFlat, cached) {
  const cachedFlat = flattenMessages(cached?.messages ?? {})
  const hashes = cached?.source_hashes ?? {}
  const stale = []
  for (const [path, text] of Object.entries(sourceFlat ?? {})) {
    if (typeof text !== 'string' || text.trim() === '') continue
    if (typeof cachedFlat[path] !== 'string' || cachedFlat[path].trim() === '') {
      stale.push(path)
      continue
    }
    if (hashes[path] !== hashSource(text)) stale.push(path)
  }
  return stale
}

/**
 * Fold a finished translation run into the stored row.
 *
 * Returns the next `{ messages, source_hashes }`. Translations that lost a
 * placeholder are dropped (see `placeholdersIntact`) and their hash is NOT
 * recorded, so the next run tries again rather than treating the failure as
 * settled.
 *
 * @param {Object} cached                        existing row, may be null
 * @param {Object.<string, string>} sourceFlat   flattened English messages
 * @param {Object.<string, string>} translated   dotted path → translated text
 * @returns {{messages: Object, source_hashes: Object, applied: number, rejected: string[]}}
 */
export function applyUiTranslations(cached, sourceFlat, translated) {
  const flat = flattenMessages(cached?.messages ?? {})
  const hashes = { ...(cached?.source_hashes ?? {}) }
  const rejected = []
  let applied = 0

  for (const [path, text] of Object.entries(translated ?? {})) {
    const source = sourceFlat?.[path]
    if (typeof source !== 'string' || typeof text !== 'string' || text.trim() === '') continue
    if (!placeholdersIntact(source, text)) {
      rejected.push(path)
      continue
    }
    flat[path] = text
    hashes[path] = hashSource(source)
    applied++
  }

  // Keys that have left the catalog would otherwise linger forever, and their
  // stale hashes would make a future key of the same name look up to date.
  for (const path of Object.keys(flat)) {
    if (!(path in (sourceFlat ?? {}))) {
      delete flat[path]
      delete hashes[path]
    }
  }

  return { messages: unflattenMessages(flat), source_hashes: hashes, applied, rejected }
}

/**
 * Deep-merge `overrides` over `base`, returning a new tree.
 *
 * Used to lay a cached language over the route locale's catalog, so any key the
 * cache lacks (never translated, or rejected for a mangled placeholder) still
 * resolves — to the route locale's wording, which is exactly today's behaviour.
 * That fallback is what makes this change strictly additive.
 *
 * `base` is returned unchanged when there is nothing to merge, so callers can
 * skip wrapping a provider.
 */
export function mergeMessages(base, overrides) {
  if (!isPlainObject(overrides) || Object.keys(overrides).length === 0) return base
  if (!isPlainObject(base)) return overrides
  const out = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    out[key] =
      isPlainObject(value) && isPlainObject(out[key]) ? mergeMessages(out[key], value) : value
  }
  return out
}
