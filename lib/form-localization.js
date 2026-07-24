import { LOCALES } from './i18n/locales.js'

const BUILT_IN = new Set(LOCALES)

// Which keys count as locale codes inside a form definition. Defaults to the
// built-in platform locales, but callers pass the event's full language set
// (built-ins + organizer-added custom languages picked from the Settings
// dropdown) so maps like {en, pt} are still recognized as localized text and
// get collected/filled during auto-translation.
function toLocaleSet(allowed) {
  if (allowed instanceof Set) return allowed
  if (Array.isArray(allowed) && allowed.length > 0) return new Set(allowed)
  return BUILT_IN
}

export function isLocaleMap(value, allowed) {
  const set = toLocaleSet(allowed)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every((key) => set.has(key)) &&
    Object.values(value).every((entry) => entry == null || typeof entry === 'string')
  )
}

export function collectLocalizedStrings(node, source, out, allowed) {
  const set = toLocaleSet(allowed)
  if (isLocaleMap(node, set)) {
    const sourceText = node[source]
    if (sourceText && sourceText.trim()) out.add(sourceText)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectLocalizedStrings(child, source, out, set))
    return
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((child) => collectLocalizedStrings(child, source, out, set))
  }
}

export function applyLocalizedTranslations(node, source, targets, dict, allowed) {
  const set = toLocaleSet(allowed)
  if (isLocaleMap(node, set)) {
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
    return node.map((child) => applyLocalizedTranslations(child, source, targets, dict, set))
  }
  if (node && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] = applyLocalizedTranslations(value, source, targets, dict, set)
    }
    return out
  }
  return node
}
