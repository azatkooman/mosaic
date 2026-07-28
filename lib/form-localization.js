import { LOCALES } from './i18n/locales.js'

const LOCALE_SET = new Set(LOCALES)

/**
 * Reserved key inside a locale map holding machine-translation provenance:
 *
 *   { en: 'Full name', es: 'Nombre completo', _mt: { es: '1f4a9c2b' } }
 *
 * `_mt[target]` is the hash of the SOURCE text that `map[target]` was
 * machine-translated from. That single fact answers all three questions the
 * organizer cares about, per field, with no dirty flags in the editors:
 *
 *   - no `_mt[target]` but text present  → a human typed it; never overwrite
 *   - `_mt[target]` === hash(source)     → up to date; costs nothing to skip
 *   - `_mt[target]` !== hash(source)     → the source was edited; retranslate
 *   - target empty                       → first run, or a newly added language
 *
 * It lives INSIDE the map rather than in a sidecar keyed by field path because
 * questions, options and page-content items get reordered and deleted, and
 * options have no stable id — any path-keyed store desynchronizes on the first
 * drag. Here provenance travels with the field through every existing splice.
 */
export const MT_KEY = '_mt'

/**
 * Hash of a source string. FNV-1a → base36: no crypto import, and identical in
 * the browser (event-page editor) and on the server (form route), which matters
 * because both ends compare these stamps.
 *
 * A collision would only ever mean one missed retranslation: stamps are
 * compared between two specific strings (a field's old vs. new source), never
 * searched across a corpus.
 */
export function hashSource(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const filled = (value) => typeof value === 'string' && value.trim() !== ''

function provenanceOf(map) {
  const mt = map?.[MT_KEY]
  return mt && typeof mt === 'object' && !Array.isArray(mt) ? mt : null
}

// A locale map is an object of language-code → string (e.g. {en:'Hi', tg:'...'}).
// `codes` bounds which keys count as language codes: it defaults to the built-in
// locales, but callers translating into organizer-defined custom languages pass
// the wider Google-supported set so maps that already contain a custom code are
// still recognized (and re-translated) instead of being silently skipped.
//
// MT_KEY is exempt from both checks — it is neither a language code nor a
// string. Forgetting that exemption would make every stamped field look like a
// plain object and quietly stop translating it.
export function isLocaleMap(value, codes = LOCALE_SET) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).filter((key) => key !== MT_KEY)
  return (
    keys.length > 0 &&
    keys.every((key) => codes.has(key)) &&
    keys.every((key) => value[key] == null || typeof value[key] === 'string')
  )
}

// Walk every locale map in the tree. Both the collect and apply passes go
// through these two so they can never disagree about what a locale map is.
function forEachLocaleMap(node, codes, visit) {
  if (isLocaleMap(node, codes)) {
    visit(node)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((child) => forEachLocaleMap(child, codes, visit))
    return
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((child) => forEachLocaleMap(child, codes, visit))
  }
}

// Rewrite every locale map, preserving object identity where nothing changed so
// callers can compare by reference (and avoid marking an editor dirty for a
// translation run that wrote nothing).
function mapLocaleMaps(node, codes, transform) {
  if (isLocaleMap(node, codes)) return transform(node)
  if (Array.isArray(node)) {
    let changed = false
    const out = node.map((child) => {
      const next = mapLocaleMaps(child, codes, transform)
      if (next !== child) changed = true
      return next
    })
    return changed ? out : node
  }
  if (node && typeof node === 'object') {
    let changed = false
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      const next = mapLocaleMaps(value, codes, transform)
      if (next !== value) changed = true
      out[key] = next
    }
    return changed ? out : node
  }
  return node
}

/**
 * Does `target` need (re)translating in this map? The whole feature is this
 * function; everything else just walks the tree and calls it.
 */
export function targetNeedsTranslation(map, source, target, { force = false } = {}) {
  if (target === source) return false
  const sourceText = map?.[source]
  // Nothing to translate from — an empty source can't produce a translation.
  if (!filled(sourceText)) return false
  // "Retranslate everything" deliberately ignores provenance, including the
  // human-authored guard below. It is the only way back from a bad hand-edit.
  if (force) return true
  // Empty slot: either the very first translation run, or a language the
  // organizer just added to an event whose other languages are already done.
  if (!filled(map?.[target])) return true
  const stamp = provenanceOf(map)?.[target]
  // Text with no stamp was typed by a human. Leave it alone, forever.
  if (typeof stamp !== 'string') return false
  return stamp !== hashSource(sourceText)
}

/**
 * Adopt translations that predate provenance tracking.
 *
 * Content translated before `_mt` existed carries no stamps, so every filled
 * target would read as human-authored and be protected forever — the tracking
 * would appear to do nothing on existing events. Stamping those translations
 * against the CURRENT source instead treats them as up to date: no Google cost,
 * nothing overwritten, and edits from here on are detected normally.
 *
 * The trade-off, accepted deliberately: a translation a human typed *before*
 * this shipped is indistinguishable from machine output, so a later source edit
 * will refresh it. Hand-edits made from now on are recorded (the editors clear
 * the stamp) and stay protected.
 *
 * `locales` must be the event's FULL language set, not just this run's targets.
 * Stamping only the current targets would leave the others unstamped inside an
 * already-stamped map, which reads as human-authored — so a form translated one
 * language-tab at a time would freeze every language but the first.
 */
export function stampUntracked(node, source, locales, codes = LOCALE_SET) {
  return mapLocaleMaps(node, codes, (map) => {
    // Presence of `_mt` means this map is already tracked; a target missing
    // from it is then meaningful (a human edit), not merely unrecorded.
    if (provenanceOf(map)) return map
    const sourceText = map[source]
    if (!filled(sourceText)) return map
    const hash = hashSource(sourceText)
    const stamp = {}
    for (const locale of locales) {
      if (locale !== source && filled(map[locale])) stamp[locale] = hash
    }
    if (Object.keys(stamp).length === 0) return map
    return { ...map, [MT_KEY]: stamp }
  })
}

/**
 * Source strings that actually need sending to the translation API, bucketed
 * per target: `{ es: ['Full name'], fr: ['Full name', 'Email'] }`.
 *
 * Per-target rather than one shared list because the buckets genuinely diverge
 * exactly when it is most expensive: adding a language needs every string for
 * the new code while the existing ones need only the handful the organizer
 * edited. A shared list would retranslate the whole document in every language
 * each time a language is added.
 */
export function collectStaleStrings(node, source, targets, codes = LOCALE_SET, options = {}) {
  const buckets = new Map(targets.filter((target) => target !== source).map((t) => [t, new Set()]))
  forEachLocaleMap(node, codes, (map) => {
    for (const [target, bucket] of buckets) {
      if (targetNeedsTranslation(map, source, target, options)) bucket.add(map[source])
    }
  })
  const out = {}
  for (const [target, bucket] of buckets) {
    if (bucket.size > 0) out[target] = [...bucket]
  }
  return out
}

/**
 * Is anything out of date — a blank slot, or a field whose source text changed
 * since it was last translated? Drives the context-aware translate button: when
 * this is false there is nothing a safe run would do, so the button offers a
 * forced redo instead.
 *
 * Content that predates provenance tracking reads as NOT stale (its filled,
 * unstamped targets are treated as human-authored and protected), which matches
 * what a safe run would actually do with it — adopt and skip. That is exactly
 * the case the forced redo exists for.
 */
export function hasStaleTranslations(node, source, targets, codes = LOCALE_SET) {
  return Object.keys(collectStaleStrings(node, source, targets, codes)).length > 0
}

/**
 * Write translations back, stamping each one with the source it came from.
 * `dict` is `{ [target]: Map(sourceString -> translated) }`.
 *
 * A target the API didn't return is left untouched — field and stamp both — so
 * a partial failure simply retries on the next run.
 */
export function applyLocalizedTranslations(
  node,
  source,
  targets,
  dict,
  codes = LOCALE_SET,
  options = {}
) {
  return mapLocaleMaps(node, codes, (map) => {
    const sourceText = map[source]
    if (!filled(sourceText)) return map
    const hash = hashSource(sourceText)
    let next = null
    const stamp = { ...(provenanceOf(map) ?? {}) }
    for (const target of targets) {
      if (!targetNeedsTranslation(map, source, target, options)) continue
      const translated = dict[target]?.get(sourceText)
      if (!filled(translated)) continue
      next ??= { ...map }
      next[target] = translated
      stamp[target] = hash
    }
    if (!next) return map
    next[MT_KEY] = stamp
    return next
  })
}

/**
 * Clear a target's stamp because a human just typed over it, which protects it
 * from future retranslation. Call this ONLY for non-source locales: editing the
 * source language must leave stamps intact, since the resulting hash mismatch
 * is precisely what marks the field as modified.
 */
export function clearTranslationStamp(map, locale) {
  const stamp = provenanceOf(map)
  if (!stamp || !(locale in stamp)) return map
  const next = { ...map, [MT_KEY]: { ...stamp } }
  delete next[MT_KEY][locale]
  if (Object.keys(next[MT_KEY]).length === 0) delete next[MT_KEY]
  return next
}

/**
 * Set one locale's text in a locale map, recording whether it was typed by a
 * human. Every editor writing localized text should go through this so hand
 * edits are protected consistently.
 */
export function setLocalizedText(map, locale, value, source) {
  const next = { ...(map ?? {}), [locale]: value }
  return locale === source ? next : clearTranslationStamp(next, locale)
}

/**
 * Retranslate a document: adopt untracked content, work out what changed, hand
 * the per-target string lists to `translate`, write the results back.
 *
 * `translate({ [target]: string[] })` must resolve to `{ [target]: string[] }`
 * aligned by index. Both callers share this so the client-side event editor and
 * the server-side form route can't drift apart.
 */
export async function retranslateDocument(
  node,
  { source, targets, locales, force = false, translate }
) {
  const codes = new Set([...LOCALES, ...locales, ...targets])
  const stamped = stampUntracked(node, source, locales, codes)
  const requests = collectStaleStrings(stamped, source, targets, codes, { force })
  const activeTargets = Object.keys(requests)
  if (activeTargets.length === 0) {
    return { node: stamped, changed: stamped !== node, translated: 0 }
  }

  const translations = await translate(requests)

  const dict = {}
  let translated = 0
  for (const target of activeTargets) {
    const sent = requests[target]
    const received = translations?.[target]
    // Misaligned output would map strings onto the wrong translations, which is
    // far worse than translating nothing. Drop the target instead.
    if (!Array.isArray(received) || received.length !== sent.length) continue
    dict[target] = new Map(sent.map((text, index) => [text, received[index]]))
    translated += sent.length
  }

  const next = applyLocalizedTranslations(stamped, source, activeTargets, dict, codes, { force })
  return { node: next, changed: next !== node, translated }
}

/**
 * Delete the given language codes from every locale map in a JSON tree.
 *
 * Dropping a language from an event has to erase its text, not just hide it:
 * text left behind would silently reappear — stale — the moment the organizer
 * re-added the language. Provenance does not save us here: the re-added text is
 * non-empty and still stamped against an unchanged source, so it reads as up to
 * date and no amount of re-translating would overwrite it.
 *
 * The stamps go with it, for the same reason the text does — a stamp naming a
 * language the event no longer offers is dead weight that would outlive every
 * other trace of it.
 *
 * `codes` bounds which keys count as language codes; pass the event's full set
 * from *before* the removal so maps holding a dropped code are still
 * recognized.
 */
export function stripLocales(node, remove, codes = LOCALE_SET) {
  if (!remove || remove.size === 0) return node
  return mapLocaleMaps(node, codes, (map) => {
    const kept = {}
    for (const [key, value] of Object.entries(map)) {
      if (key !== MT_KEY && !remove.has(key)) kept[key] = value
    }
    // Every language gone: drop the stamps too, rather than leaving an object
    // that no longer reads as a locale map but still carries bookkeeping.
    if (Object.keys(kept).length === 0) return {}
    const stamp = provenanceOf(map)
    if (stamp) {
      const nextStamp = {}
      for (const [locale, hash] of Object.entries(stamp)) {
        if (!remove.has(locale)) nextStamp[locale] = hash
      }
      if (Object.keys(nextStamp).length > 0) kept[MT_KEY] = nextStamp
    }
    return kept
  })
}
