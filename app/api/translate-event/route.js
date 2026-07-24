import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTranslateLanguages } from '@/lib/i18n/translate-languages'

// Google Cloud Translation v2 HTML-escapes some characters even in text mode.
function unescapeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// Translate a batch of strings via Google Cloud Translation (v2, API key).
// Google accepts up to 128 text segments per request, so chunk to be safe.
async function translateBatch(strings, source, target, apiKey) {
  const out = []
  for (let i = 0; i < strings.length; i += 100) {
    const chunk = strings.slice(i, i + 100)
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
    for (const it of items) out.push(unescapeHtml(it.translatedText ?? ''))
  }
  return out
}

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

  const { strings, source, targets } = body ?? {}
  if (
    !Array.isArray(strings) ||
    typeof source !== 'string' ||
    !Array.isArray(targets) ||
    !supported.has(source)
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (strings.length === 0 || targets.length === 0) {
    return NextResponse.json({ translations: {} })
  }
  if (strings.length > 300) {
    return NextResponse.json({ error: 'too_many_strings' }, { status: 400 })
  }

  const translations = {}
  try {
    for (const target of targets) {
      if (!supported.has(target) || target === source) continue
      translations[target] = await translateBatch(strings, source, target, apiKey)
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'translation_failed', detail: String(e.message) },
      { status: 502 }
    )
  }

  return NextResponse.json({ translations })
}
