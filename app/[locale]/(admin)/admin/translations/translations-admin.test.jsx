import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'

vi.mock('@/lib/i18n/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/components/providers/DateFormatProvider', () => ({
  useDateFormatPrefs: () => ({ dateFormat: 'auto', timeFormat: 'auto' }),
}))

const { TranslationsAdmin, sweepLanguages } = await import('./TranslationsAdmin')

const LANGS = [
  {
    code: 'th',
    name: 'Thai',
    cached: true,
    cachedCount: 114,
    staleCount: 0,
    updatedAt: '2026-08-07T10:52:14Z',
    eventCount: 3,
  },
  {
    code: 'ko',
    name: 'Korean',
    cached: false,
    cachedCount: 0,
    staleCount: 114,
    updatedAt: null,
    eventCount: 1,
  },
  {
    code: 'ar',
    name: 'Arabic',
    cached: true,
    cachedCount: 110,
    staleCount: 4,
    updatedAt: '2026-08-07T11:20:00Z',
    eventCount: 1,
  },
]

const render = (props) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <TranslationsAdmin totalKeys={114} locale="en" {...props} />
    </NextIntlClientProvider>
  )

describe('TranslationsAdmin markup', () => {
  it('distinguishes never-cached from merely outdated', () => {
    const html = render({ languages: LANGS })
    // The two failure modes have different causes and must not look alike.
    expect(html).toContain('Not translated yet') // ko: no row at all
    expect(html).toContain('110 / 114') // ar: cached but incomplete
    expect(html).toContain('114 / 114') // th: complete
  })

  it('lists every language with its code and event usage', () => {
    const html = render({ languages: LANGS })
    for (const lang of LANGS) {
      expect(html).toContain(lang.name)
      expect(html).toContain(`(${lang.code})`)
    }
    expect(html).toContain('Used by 3 event(s)')
  })

  it('says everything is up to date when nothing needs work', () => {
    const html = render({
      languages: [{ ...LANGS[0] }],
    })
    expect(html).toContain('Everything is up to date.')
  })

  it('explains itself when no organizer has added a language', () => {
    const html = render({ languages: [] })
    expect(html).toContain('there is nothing to translate')
    // The five built-ins are hand-translated and deliberately never listed.
    expect(html).toContain('translated by hand')
  })
})

describe('sweepLanguages', () => {
  const ok = (translated) => ({ ok: true, status: 200, data: { translated } })

  it('tallies only the languages that actually changed', async () => {
    const calls = []
    const result = await sweepLanguages(['th', 'ko', 'ar'], async (code) => {
      calls.push(code)
      return ok({ th: 0, ko: 114, ar: 4 }[code])
    })
    expect(calls).toEqual(['th', 'ko', 'ar'])
    // th needed nothing, so "updated 3 languages" would have been a lie.
    expect(result).toEqual({ langsChanged: 2, keysChanged: 118, failed: [], aborted: null })
  })

  it('reports progress per language', async () => {
    const seen = []
    await sweepLanguages(['th', 'ko'], async () => ok(1), (code) => seen.push(code))
    expect(seen).toEqual(['th', 'ko'])
  })

  it('records one language failing and still finishes the rest', async () => {
    const result = await sweepLanguages(['th', 'ko', 'ar'], async (code) =>
      code === 'ko' ? { ok: false, status: 502, data: { error: 'translation_failed' } } : ok(2)
    )
    expect(result.failed).toEqual([{ code: 'ko', reason: 'translation_failed' }])
    expect(result.langsChanged).toBe(2) // th and ar still went through
    expect(result.aborted).toBeNull()
  })

  it('aborts on a missing API key rather than repeating the error per language', async () => {
    let calls = 0
    const result = await sweepLanguages(['th', 'ko', 'ar'], async () => {
      calls++
      return { ok: false, status: 400, data: { error: 'no_api_key' } }
    })
    expect(calls).toBe(1)
    expect(result.aborted).toBe('no_api_key')
  })

  it('aborts on a rate limit, keeping what already succeeded', async () => {
    const result = await sweepLanguages(['th', 'ko', 'ar'], async (code) =>
      code === 'th' ? ok(5) : { ok: false, status: 429, data: { error: 'too_many_requests' } }
    )
    expect(result.aborted).toBe('rate_limited')
    expect(result.keysChanged).toBe(5)
  })

  it('treats a transport failure as one language failing, not a crash', async () => {
    const result = await sweepLanguages(['th', 'ko'], async (code) => {
      if (code === 'th') throw new Error('offline')
      return ok(3)
    })
    expect(result.failed).toEqual([{ code: 'th', reason: 'offline' }])
    expect(result.keysChanged).toBe(3)
  })
})
