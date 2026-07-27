import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTranslateLanguages } from '@/lib/i18n/translate-languages'
import { translateRequests } from '@/lib/i18n/google-translate'

// The event-page editor walks the content client-side (it already holds the
// unsaved draft) and sends only the strings that still need translating, keyed
// by target language: { requests: { es: ['Full name'], fr: [...] }, source }.
// Per-target lists matter because the lists diverge sharply when a language is
// added — the new one needs everything, the rest need only edited fields.
const MAX_STRINGS_PER_TARGET = 300

export async function POST(request) {
  // Require an authenticated organizer to avoid anonymous API abuse/cost.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // Gate against the languages Google actually supports (fetched + cached), so
  // any organizer-picked language works without maintaining a hardcoded list.
  const supported = new Set((await getTranslateLanguages()).map((l) => l.code))

  const { requests, source } = body ?? {}
  if (
    !requests ||
    typeof requests !== 'object' ||
    Array.isArray(requests) ||
    typeof source !== 'string' ||
    !supported.has(source)
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const entries = Object.entries(requests).filter(
    ([target, strings]) =>
      target !== source &&
      supported.has(target) &&
      Array.isArray(strings) &&
      strings.length > 0 &&
      strings.every((s) => typeof s === 'string')
  )
  if (entries.length === 0) {
    return NextResponse.json({ translations: {} })
  }
  if (entries.some(([, strings]) => strings.length > MAX_STRINGS_PER_TARGET)) {
    return NextResponse.json({ error: 'too_many_strings' }, { status: 400 })
  }

  try {
    const translations = await translateRequests(
      Object.fromEntries(entries),
      source,
      apiKey,
      supported
    )
    return NextResponse.json({ translations })
  } catch (e) {
    return NextResponse.json(
      { error: 'translation_failed', detail: String(e.message) },
      { status: 502 }
    )
  }
}
