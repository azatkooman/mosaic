import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTranslateLanguages } from '@/lib/i18n/translate-languages'
import { retranslateDocument } from '@/lib/form-localization'
import { translateRequests } from '@/lib/i18n/google-translate'

export async function POST(request) {
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
  // organizer-picked custom languages translate too — not just the built-ins.
  const supported = new Set((await getTranslateLanguages()).map((l) => l.code))

  const { definition, source, targets, locales, force } = body ?? {}
  if (
    !definition ||
    typeof definition !== 'object' ||
    typeof source !== 'string' ||
    !Array.isArray(targets) ||
    !supported.has(source)
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const MAX_TARGETS = 5
  const targetList = targets
    .filter((target) => typeof target === 'string' && supported.has(target) && target !== source)
    .slice(0, MAX_TARGETS)
  if (targetList.length === 0) {
    return NextResponse.json({ translatedDefinition: definition, translated: 0 })
  }

  const validLocales = Array.isArray(locales)
    ? locales.filter((locale) => typeof locale === 'string' && supported.has(locale))
    : []

  try {
    // Only fields whose source text changed since they were last translated (or
    // that have no translation yet) reach Google, so switching language tabs on
    // an unedited form costs nothing beyond this round trip.
    const { node, translated } = await retranslateDocument(definition, {
      source,
      targets: targetList,
      locales: validLocales.length ? validLocales : [source, ...targetList],
      force: force === true,
      translate: (requests) => translateRequests(requests, source, apiKey, supported),
    })
    return NextResponse.json({ translatedDefinition: node, translated })
  } catch (error) {
    return NextResponse.json(
      { error: 'translation_failed', detail: String(error?.message ?? error) },
      { status: 502 }
    )
  }
}
