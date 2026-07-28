import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The event-page editor walks its own unsaved draft client-side, so this route
// is a thin pass-through: its job is to validate, then fan the per-target string
// lists out to Google. These tests pin the request/response contract the editor
// depends on.
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'organizer-1' } } }) },
  }),
}))

vi.mock('@/lib/i18n/translate-languages', () => ({
  getTranslateLanguages: async () => [{ code: 'en' }, { code: 'es' }, { code: 'fr' }],
}))

const { POST } = await import('./route.js')

let googleCalls = []

beforeEach(() => {
  googleCalls = []
  process.env.GOOGLE_TRANSLATE_API_KEY = 'test-key'
  vi.stubGlobal('fetch', async (url, init) => {
    const body = JSON.parse(init.body)
    googleCalls.push({ target: body.target, q: body.q })
    return {
      ok: true,
      json: async () => ({
        data: { translations: body.q.map((q) => ({ translatedText: `${body.target}:${q}` })) },
      }),
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GOOGLE_TRANSLATE_API_KEY
})

const post = (body) =>
  POST(
    new Request('http://localhost/api/translate-event', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )

describe('POST /api/translate-event', () => {
  it('translates each target only the strings sent for it', async () => {
    const res = await post({
      source: 'en',
      requests: { es: ['Welcome'], fr: ['Welcome', 'Speakers'] },
    })
    expect(res.status).toBe(200)
    const { translations } = await res.json()

    // Per-target lists are the point: 'Speakers' is stale in French only, and
    // must not be re-billed in Spanish.
    expect(googleCalls).toEqual([
      { target: 'es', q: ['Welcome'] },
      { target: 'fr', q: ['Welcome', 'Speakers'] },
    ])
    expect(translations).toEqual({
      es: ['es:Welcome'],
      fr: ['fr:Welcome', 'fr:Speakers'],
    })
  })

  it('drops unsupported targets and the source language instead of failing', async () => {
    const res = await post({
      source: 'en',
      requests: { es: ['Welcome'], en: ['Welcome'], zz: ['Welcome'] },
    })
    expect(res.status).toBe(200)
    expect(googleCalls).toEqual([{ target: 'es', q: ['Welcome'] }])
  })

  it('returns an empty result rather than an error when nothing is stale', async () => {
    const res = await post({ source: 'en', requests: {} })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ translations: {} })
    expect(googleCalls).toEqual([])
  })

  it('rejects a malformed body without calling Google', async () => {
    expect((await post({ source: 'en' })).status).toBe(400)
    expect((await post({ source: 'en', requests: ['Welcome'] })).status).toBe(400)
    expect((await post({ source: 'zz', requests: { es: ['Hi'] } })).status).toBe(400)
    expect((await post({ source: 'en', requests: { es: [1, 2] } })).status).toBe(200)
    expect(googleCalls).toEqual([])
  })

  it('caps the per-target batch so one click cannot run up an unbounded bill', async () => {
    const res = await post({
      source: 'en',
      requests: { es: Array.from({ length: 301 }, (_, i) => `s${i}`) },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('too_many_strings')
    expect(googleCalls).toEqual([])
  })

  it('reports a provider failure as 502', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, text: async () => 'quota exceeded' }))
    const res = await post({ source: 'en', requests: { es: ['Welcome'] } })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('translation_failed')
  })

  it('refuses to run without an API key', async () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY
    const res = await post({ source: 'en', requests: { es: ['Welcome'] } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('no_api_key')
  })
})
