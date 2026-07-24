export const LOCALES = ['en', 'es', 'fr', 'ru', 'uk']
export const DEFAULT_LOCALE = 'en'

export const LOCALE_NAMES = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ru: 'Русский',
  uk: 'Українська',
}

/**
 * Resolve a localized JSONB value ({en: "...", es: "..."}) to a string.
 * Falls back: requested locale → fallback locale → first available.
 */
export function lt(value, locale, fallbackLocale = DEFAULT_LOCALE) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? value[fallbackLocale] ?? Object.values(value)[0] ?? ''
}

/**
 * The languages an event is offered in — built-ins (in canonical LOCALES
 * order) followed by any organizer-defined custom codes. This mirrors the
 * logic the event-page editor/view use so every surface agrees.
 *
 * Source of truth is `page_content.i18n.available`; falls back to the legacy
 * `supported_locales` column, then to locales that have an event name filled
 * in, then to the default locale. The default locale is always included.
 */
export function eventLocales(event) {
  const content = event?.page_content
  const customCodes = Array.isArray(content?.i18n?.custom)
    ? content.i18n.custom.map((c) => c.code)
    : []
  const explicit = content?.i18n?.available
  const legacy = event?.supported_locales
  const base =
    Array.isArray(explicit) && explicit.length
      ? explicit
      : Array.isArray(legacy) && legacy.length
        ? legacy
        : LOCALES.filter((l) => (event?.name?.[l] ?? '').trim() !== '')

  const valid = new Set([...LOCALES, ...customCodes])
  const set = new Set(base.filter((l) => valid.has(l)))
  set.add(event?.default_locale ?? DEFAULT_LOCALE)

  const builtins = LOCALES.filter((l) => set.has(l))
  const customs = customCodes.filter((c) => set.has(c))
  const all = [...builtins, ...customs]
  return all.length ? all : [event?.default_locale ?? DEFAULT_LOCALE]
}

/** Display name for a language code: built-in name, custom name, or the code. */
export function localeName(event, code) {
  if (LOCALE_NAMES[code]) return LOCALE_NAMES[code]
  const custom = event?.page_content?.i18n?.custom
  const found = Array.isArray(custom) ? custom.find((c) => c.code === code) : null
  return found?.name || code
}
