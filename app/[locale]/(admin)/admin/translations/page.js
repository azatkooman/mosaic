import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { LOCALES } from '@/lib/i18n/locales'
import {
  flattenMessages,
  pickUiMessages,
  staleUiKeys,
} from '@/lib/i18n/ui-messages'
import enMessages from '@/messages/en.json'
import { TranslationsAdmin } from './TranslationsAdmin'
import styles from '../admin-shell.module.css'

export const dynamic = 'force-dynamic'

/**
 * Admin ▸ Interface languages.
 *
 * The platform's own UI text is machine-translated once per organizer-added
 * language into `ui_translations` and shared by every event (migration 0037).
 * Until this page existed, a language only ever caught up when an organizer
 * happened to open the event-page customizer and switch into it — so any string
 * WE added to messages/en.json left every custom language partly untranslated
 * until that coincidence occurred. This is the deliberate way to fix that.
 *
 * Two distinct problems are surfaced, because they have different causes:
 *
 *   outdated     cached, but some text is missing or was reworded since — the
 *                per-key source hashes say exactly how much.
 *   not cached   a language an event offers that has no row at all, e.g. added
 *                while GOOGLE_TRANSLATE_API_KEY was unset, or whose warm-up
 *                request failed silently (it is fire-and-forget by design).
 *
 * Read-only on its own; the refresh runs through /api/ui-translations, which
 * stays the single authority on what gets translated and what it costs.
 */
export default async function AdminTranslationsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('console')

  const supabase = await getSupabaseServerClient()

  const [{ data: rows }, { data: events }] = await Promise.all([
    supabase.from('ui_translations').select('code, messages, source_hashes, updated_at'),
    // Only the language block, not the whole page_content — that column holds
    // every section's text and images and would be megabytes across all events.
    supabase.from('events').select('id, i18n:page_content->i18n').is('deleted_at', null),
  ])

  // How many events offer each custom language. A language with no events left
  // is still listed if it has a row: the text costs nothing to keep and the next
  // organizer to pick that language gets it for free.
  const eventCounts = new Map()
  const organizerNames = new Map()
  for (const event of events ?? []) {
    const available = Array.isArray(event.i18n?.available) ? event.i18n.available : []
    const custom = Array.isArray(event.i18n?.custom) ? event.i18n.custom : []
    for (const entry of custom) {
      if (entry?.code && !organizerNames.has(entry.code)) {
        organizerNames.set(entry.code, entry.name)
      }
    }
    for (const code of available) {
      // Platform locales are hand-translated in the repo and never cached.
      if (LOCALES.includes(code)) continue
      eventCounts.set(code, (eventCounts.get(code) ?? 0) + 1)
    }
  }

  const sourceFlat = flattenMessages(pickUiMessages(enMessages))
  const totalKeys = Object.keys(sourceFlat).length

  const byCode = new Map((rows ?? []).map((r) => [r.code, r]))
  const codes = [...new Set([...byCode.keys(), ...eventCounts.keys()])].sort()

  // Display name from Intl where it knows the code, falling back to whatever the
  // organizer called it, then the code itself. Some Google codes (`yue`, `iw`)
  // are not names Intl carries, which is why all three steps exist.
  let displayNames = null
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'language' })
  } catch {
    displayNames = null
  }
  const nameFor = (code) => {
    let intlName
    try {
      intlName = displayNames?.of(code)
    } catch {
      intlName = undefined
    }
    if (intlName && intlName !== code) return intlName
    return organizerNames.get(code) || code
  }

  const languages = codes.map((code) => {
    const row = byCode.get(code)
    return {
      code,
      name: nameFor(code),
      cached: Boolean(row),
      cachedCount: row ? Object.keys(flattenMessages(row.messages ?? {})).length : 0,
      staleCount: staleUiKeys(sourceFlat, row).length,
      updatedAt: row?.updated_at ?? null,
      eventCount: eventCounts.get(code) ?? 0,
    }
  })

  return (
    <div className={styles.pageWide}>
      <div className={styles.pageHead}>
        <h1 className="page-title">{t('adminTranslations')}</h1>
      </div>
      <p style={{ color: 'var(--ink-soft)' }}>{t('adminTranslationsIntro')}</p>
      <TranslationsAdmin languages={languages} totalKeys={totalKeys} locale={locale} />
    </div>
  )
}
