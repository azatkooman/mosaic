import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Exercise the real route handler with only the two things it can't reach in a
// test stubbed out: the auth check and Google itself. The unit tests cover the
// diffing rules; this covers the wiring — that a request shaped like the form
// builder's actually produces per-target Google calls and a stamped definition.
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'organizer-1' } } }) },
  }),
}))

vi.mock('@/lib/i18n/translate-languages', () => ({
  getTranslateLanguages: async () => [
    { code: 'en' },
    { code: 'es' },
    { code: 'fr' },
    { code: 'de' },
  ],
}))

const { POST } = await import('./route.js')

// Every Google call made during a test, as { source, target, q }.
let googleCalls = []

beforeEach(() => {
  googleCalls = []
  process.env.GOOGLE_TRANSLATE_API_KEY = 'test-key'
  vi.stubGlobal('fetch', async (url, init) => {
    const body = JSON.parse(init.body)
    googleCalls.push({ source: body.source, target: body.target, q: body.q })
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
  POST(new Request('http://localhost/api/translate-form', { method: 'POST', body: JSON.stringify(body) }))

const definition = () => ({
  questions: [
    { id: 'q1', type: 'text', label: { en: 'Name', es: '' } },
    { id: 'q2', type: 'text', label: { en: 'Email', es: '' } },
  ],
})

const request = (definition, extra) => ({
  definition,
  source: 'en',
  targets: ['es'],
  locales: ['en', 'es'],
  ...extra,
})

describe('POST /api/translate-form', () => {
  it('translates every field on the first run and stamps the result', async () => {
    const res = await post(request(definition()))
    expect(res.status).toBe(200)
    const { translatedDefinition, translated } = await res.json()

    expect(googleCalls).toEqual([{ source: 'en', target: 'es', q: ['Name', 'Email'] }])
    expect(translated).toBe(2)
    expect(translatedDefinition.questions[0].label.es).toBe('es:Name')
    expect(translatedDefinition.questions[1].label.es).toBe('es:Email')
  })

  it('calls Google zero times on an unchanged second run', async () => {
    const first = await (await post(request(definition()))).json()
    googleCalls = []

    const res = await post(request(first.translatedDefinition))
    const { translatedDefinition, translated } = await res.json()

    expect(googleCalls).toEqual([])
    expect(translated).toBe(0)
    expect(translatedDefinition).toEqual(first.translatedDefinition)
  })

  it('sends only the edited field on a later run', async () => {
    const first = await (await post(request(definition()))).json()
    const edited = structuredClone(first.translatedDefinition)
    edited.questions[1].label.en = 'Email address'
    googleCalls = []

    const { translatedDefinition } = await (await post(request(edited))).json()

    expect(googleCalls).toEqual([{ source: 'en', target: 'es', q: ['Email address'] }])
    expect(translatedDefinition.questions[1].label.es).toBe('es:Email address')
    expect(translatedDefinition.questions[0].label.es).toBe('es:Name')
  })

  it('translates the whole form for a language added later', async () => {
    const first = await (await post(request(definition()))).json()
    googleCalls = []

    const { translatedDefinition } = await (
      await post(
        request(first.translatedDefinition, { targets: ['de'], locales: ['en', 'es', 'de'] })
      )
    ).json()

    expect(googleCalls).toEqual([{ source: 'en', target: 'de', q: ['Name', 'Email'] }])
    expect(translatedDefinition.questions[0].label.de).toBe('de:Name')
    expect(translatedDefinition.questions[0].label.es).toBe('es:Name')
  })

  it('retranslates everything under force, including hand-typed text', async () => {
    const handTyped = {
      questions: [{ id: 'q1', type: 'text', label: { en: 'Name', es: 'Nombre propio' } }],
    }

    // Without force the hand-typed Spanish is protected...
    const guarded = await (await post(request(handTyped))).json()
    expect(googleCalls).toEqual([])
    expect(guarded.translatedDefinition.questions[0].label.es).toBe('Nombre propio')

    // ...and force is the documented way past it.
    const forced = await (await post(request(handTyped, { force: true }))).json()
    expect(googleCalls).toEqual([{ source: 'en', target: 'es', q: ['Name'] }])
    expect(forced.translatedDefinition.questions[0].label.es).toBe('es:Name')
  })

  it('rejects an unauthenticated or malformed request without calling Google', async () => {
    expect((await post({ source: 'en', targets: ['es'] })).status).toBe(400)
    expect((await post(request(definition(), { source: 'zz' }))).status).toBe(400)
    expect(googleCalls).toEqual([])
  })

  it('reports a provider failure as 502 rather than corrupting the definition', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, text: async () => 'quota exceeded' }))
    const res = await post(request(definition()))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('translation_failed')
  })
})
