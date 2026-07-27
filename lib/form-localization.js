import { LOCALES } from './i18n/locales.js'

const LOCALE_SET = new Set(LOCALES)

// A locale map is an object of language-code → string (e.g. {en:'Hi', tg:'...'}).
// `codes` bounds which keys count as language codes: it defaults to the built-in
// locales, but callers translating into organizer-defined custom languages pass
// the wider Google-supported set so maps that already contain a custom code are
// still recognized (and re-translated) instead of being silently skipped.
export function isLocaleMap(value, codes = LOCALE_SET) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every((key) => codes.has(key)) &&
    Object.values(value).every((entry) => entry == null || typeof entry === 'string')
  )
}

export function collectLocalizedStrings(node, source, out, codes = LOCALE_SET) {
  if (isLocaleMap(node, codes)) {
    const sourceText = node[source]
    if (sourceText && sourceText.trim()) out.add(sourceText)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectLocalizedStrings(child, source, out, codes))
    return
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((child) => collectLocalizedStrings(child, source, out, codes))
  }
}

export function applyLocalizedTranslations(node, source, targets, dict, codes = LOCALE_SET) {
  if (isLocaleMap(node, codes)) {
    const sourceText = node[source]
    if (!sourceText || !sourceText.trim()) return node
    const next = { ...node }
    for (const target of targets) {
      if (!next[target] || !next[target].trim()) {
        const translated = dict[target]?.get(sourceText)
        if (translated) next[target] = translated
      }
    }
    return next
  }
  if (Array.isArray(node)) {
    return node.map((child) => applyLocalizedTranslations(child, source, targets, dict, codes))
  }
  if (node && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] = applyLocalizedTranslations(value, source, targets, dict, codes)
    }
    return out
  }
  return node
}

/**
 * Delete the given language codes from every locale map in a JSON tree.
 *
 * Dropping a language from an event has to erase its text, not just hide it:
 * translations are only ever written into *empty* slots, so text left behind
 * would silently reappear — stale — the moment the organizer re-added the
 * language, and no amount of re-translating would overwrite it.
 *
 * `codes` bounds which keys count as language codes; pass the event's full set
 * from *before* the removal so maps holding a dropped code are still
 * recognized.
 */
export function stripLocales(node, remove, codes = LOCALE_SET) {
  if (!remove || remove.size === 0) return node
  if (isLocaleMap(node, codes)) {
    const next = {}
    for (const [key, value] of Object.entries(node)) {
      if (!remove.has(key)) next[key] = value
    }
    return next
  }
  if (Array.isArray(node)) {
    return node.map((child) => stripLocales(child, remove, codes))
  }
  if (node && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] = stripLocales(value, remove, codes)
    }
    return out
  }
  return node
}
