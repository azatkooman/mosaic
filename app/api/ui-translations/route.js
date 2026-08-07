import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTranslateLanguages } from '@/lib/i18n/translate-languages'
import { translateRequests } from '@/lib/i18n/google-translate'
import { enforceRateLimit } from '@/lib/rate-limit'
import { LOCALES } from '@/lib/i18n/locales'
import {
  UI_SOURCE_LOCALE,
  applyUiTranslations,
  flattenMessages,
  pickUiMessages,
  staleUiKeys,
} from '@/lib/i18n/ui-messages'
import sourceCatalog from '@/messages/en.json'

/**
 * Cache the platform's own UI text in one organizer-added language.
 *
 * Called once per language for the whole platform, not once per event: the row
 * is keyed by language code alone, so the hundredth event to offer Thai reads
 * what the first one paid for. See lib/i18n/ui-messages.js and migration 0037.
 *
 * Idempotent and cheap to call: it compares each English string's hash against
 * the one the cached text was made from and sends only what is missing or has
 * been reworded since. A second call with nothing to do costs one SELECT and
 * returns `{ fresh: true }` without touching Google.
 *
 * Writes with the SERVICE ROLE after authenticating the caller from cookies —
 * the same shape as /api/register. The table has no user-facing write policy
 * because writing costs money; this route is the gate.
 *
 * Body: { code: string }  ·  a language from Google's supported list
 */
export async function POST(request) {
  const rateLimitRes = enforceRateLimit(request, {
    limit: 10,
    windowMs: 60000,
    keyPrefix: 'ui-translations',
  })
  if (rateLimitRes) return rateLimitRes

  // Any signed-in user may trigger this, matching /api/translate-event: the
  // caller is an organizer mid-edit, and the result is shared platform text
  // rather than anything belonging to their event. Auth + rate limiting is what
  // keeps anonymous callers from spending the translation budget.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const { code } = body ?? {}
  if (typeof code !== 'string' || code === '') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  // The five platform locales are hand-translated in the repo. Serving them
  // from a machine-translated cache would be a quality regression, so they are
  // rejected outright rather than silently ignored.
  if (LOCALES.includes(code)) {
    return NextResponse.json({ error: 'platform_locale' }, { status: 400 })
  }
  const supported = new Set((await getTranslateLanguages()).map((l) => l.code))
  if (!supported.has(code)) {
    return NextResponse.json({ error: 'unsupported_language' }, { status: 400 })
  }

  const sourceFlat = flattenMessages(pickUiMessages(sourceCatalog))

  const admin = getSupabaseAdminClient()
  const { data: existing, error: readError } = await admin
    .from('ui_translations')
    .select('messages, source_hashes')
    .eq('code', code)
    .maybeSingle()
  if (readError) {
    console.error('ui_translations read failed:', readError.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const stale = staleUiKeys(sourceFlat, existing)
  if (stale.length === 0) {
    return NextResponse.json({ code, fresh: true, translated: 0 })
  }

  // One request per language, and the attendee namespaces are ~114 keys, so
  // this never approaches Google's 128-segment limit that translateBatch
  // chunks for. Sent as a per-target map because that is the helper's shape.
  let translations
  try {
    translations = await translateRequests(
      { [code]: stale.map((path) => sourceFlat[path]) },
      UI_SOURCE_LOCALE,
      apiKey,
      supported
    )
  } catch (e) {
    return NextResponse.json(
      { error: 'translation_failed', detail: String(e.message) },
      { status: 502 }
    )
  }

  const texts = translations?.[code]
  if (!Array.isArray(texts) || texts.length !== stale.length) {
    return NextResponse.json({ error: 'translation_failed' }, { status: 502 })
  }
  const byPath = Object.fromEntries(stale.map((path, i) => [path, texts[i]]))

  const { messages, source_hashes, applied, rejected } = applyUiTranslations(
    existing,
    sourceFlat,
    byPath
  )

  const { error: writeError } = await admin.from('ui_translations').upsert(
    { code, messages, source_hashes, updated_by: user.id },
    { onConflict: 'code' }
  )
  if (writeError) {
    console.error('ui_translations upsert failed:', writeError.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // A rejected key kept its placeholder mangled by the translator; it stays
  // uncached (and so falls back to the route locale) and is retried next run.
  if (rejected.length > 0) {
    console.warn(`ui-translations ${code}: ${rejected.length} key(s) rejected:`, rejected)
  }

  return NextResponse.json({ code, fresh: false, translated: applied, rejected })
}
