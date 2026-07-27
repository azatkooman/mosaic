// Google Cloud Translation v2 HTML-escapes some characters even in text mode.
function unescapeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

// Translate a batch of strings via Google Cloud Translation (v2, API key).
// Google accepts up to 128 text segments per request, so chunk to be safe.
export async function translateBatch(strings, source, target, apiKey) {
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

/**
 * Translate per-target string lists: `{ es: [...], fr: [...] }` in, the same
 * shape out, aligned by index. Targets the provider doesn't support are dropped
 * rather than failing the whole run.
 */
export async function translateRequests(requests, source, apiKey, supported) {
  const translations = {}
  for (const [target, strings] of Object.entries(requests)) {
    if (target === source || (supported && !supported.has(target))) continue
    if (!Array.isArray(strings) || strings.length === 0) continue
    translations[target] = await translateBatch(strings, source, target, apiKey)
  }
  return translations
}
