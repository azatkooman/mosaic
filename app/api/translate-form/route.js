import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTranslateLanguages } from '@/lib/i18n/translate-languages'
import { applyLocalizedTranslations, collectLocalizedStrings } from '@/lib/form-localization'

function unescapeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

async function translateBatch(strings, source, target, apiKey) {
  const out = []
  for (let index = 0; index < strings.length; index += 100) {
    const chunk = strings.slice(index, index + 100)
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: chunk, source, target, format: 'text' }),
      }
    )
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Google Translate error ${res.status}: ${detail.slice(0, 200)}`)
    }
    const data = await res.json()
    const items = data?.data?.translations
    if (!Array.isArray(items) || items.length !== chunk.length) {
      throw new Error('Unexpected translation response shape')
    }
    for (const item of items) out.push(unescapeHtml(item.translatedText ?? ''))
  }
  return out
}

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

  const { definition, source, targets, locales } = body ?? {}
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
    return NextResponse.json({ translatedDefinition: definition })
  }

  const validLocales = Array.isArray(locales)
    ? locales.filter((locale) => typeof locale === 'string' && supported.has(locale))
    : []
  const allowed = new Set([...supported, ...validLocales])

  const sourceStrings = new Set()
  collectLocalizedStrings(definition, source, sourceStrings, allowed)
  const strings = [...sourceStrings]
  if (strings.length === 0) {
    return NextResponse.json({ translatedDefinition: definition })
  }

  const translations = {}
  try {
    for (const target of targetList) {
      translations[target] = await translateBatch(strings, source, target, apiKey)
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'translation_failed', detail: String(error?.message ?? error) },
      { status: 502 }
    )
  }

  const dict = {}
  for (const target of targetList) {
    const translated = translations[target]
    const map = new Map()
    strings.forEach((string, index) => map.set(string, translated[index]))
    dict[target] = map
  }

  return NextResponse.json({
    translatedDefinition: applyLocalizedTranslations(definition, source, targetList, dict, allowed),
  })
}