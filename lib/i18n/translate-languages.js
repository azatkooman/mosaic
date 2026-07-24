// The set of languages Google Cloud Translation supports, fetched live from
// Google's own `languages` endpoint so we never hand-maintain a list (Google
// adds languages a few times a year). The result is cached for a day since the
// set is stable. If the API key is missing or the request fails, we fall back
// to the platform's built-in locales so the picker is never empty.
import { LOCALES, LOCALE_NAMES } from './locales'

const GOOGLE_LANGUAGES_URL =
  'https://translation.googleapis.com/language/translate/v2/languages'

// Always-available fallback: the built-in platform languages.
export const FALLBACK_LANGUAGES = LOCALES.map((code) => ({
  code,
  name: LOCALE_NAMES[code],
}))

// Fetch supported languages as [{ code, name }] with English display names.
// Server-only (reads GOOGLE_TRANSLATE_API_KEY). Cached for 24h.
export async function getTranslateLanguages() {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!apiKey) return FALLBACK_LANGUAGES
  try {
    const res = await fetch(`${GOOGLE_LANGUAGES_URL}?key=${apiKey}&target=en`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return FALLBACK_LANGUAGES
    const json = await res.json()
    const langs = json?.data?.languages
    if (!Array.isArray(langs) || langs.length === 0) return FALLBACK_LANGUAGES
    // Google returns { language: 'af', name: 'Afrikaans' }.
    return langs.map((l) => ({ code: l.language, name: l.name ?? l.language }))
  } catch {
    return FALLBACK_LANGUAGES
  }
}
