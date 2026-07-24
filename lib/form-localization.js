import { LOCALES } from './i18n/locales.js'

const LOCALE_SET = new Set(LOCALES)

export function isLocaleMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every((key) => LOCALE_SET.has(key)) &&
    Object.values(value).every((entry) => entry == null || typeof entry === 'string')
  )
}

export function collectLocalizedStrings(node, source, out) {
  if (isLocaleMap(node)) {
    const sourceText = node[source]
    if (sourceText && sourceText.trim()) out.add(sourceText)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectLocalizedStrings(child, source, out))
    return
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((child) => collectLocalizedStrings(child, source, out))
  }
}

export function applyLocalizedTranslations(node, source, targets, dict) {
  if (isLocaleMap(node)) {
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
  if (Array.isArray(node)) return node.map((child) => applyLocalizedTranslations(child, source, targets, dict))
  if (node && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] = applyLocalizedTranslations(value, source, targets, dict)
    }
    return out
  }
  return node
}