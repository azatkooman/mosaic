import { describe, it, expect } from 'vitest'
import { externalHref, safeNextPath, eventPageUrl, withParam } from './url.js'

describe('eventPageUrl', () => {
  const slug = 'thai-ccci-staff-conference'

  it('puts a CUSTOM language in ?lang=, never in the path (the 404 bug)', () => {
    const url = eventPageUrl({ slug, code: 'th', uiLocale: 'en' })
    expect(url).toBe(`/en/events/${slug}?lang=th`)
    // The broken form doubled up locale segments: /en/th/events/...
    expect(url).not.toContain('/en/th/')
  })

  it('gives each PLATFORM locale its own route', () => {
    for (const l of ['en', 'es', 'fr', 'ru', 'uk']) {
      expect(eventPageUrl({ slug, code: l, uiLocale: 'en' })).toBe(`/${l}/events/${slug}`)
    }
  })

  it('keeps the custom language on whatever UI locale the organizer is using', () => {
    expect(eventPageUrl({ slug, code: 'th', uiLocale: 'ru' })).toBe(`/ru/events/${slug}?lang=th`)
  })

  it('falls back to en when the UI locale is not a platform locale', () => {
    expect(eventPageUrl({ slug, code: 'th', uiLocale: 'th' })).toBe(`/en/events/${slug}?lang=th`)
  })

  it('supports an absolute origin (Open page / Copy link)', () => {
    expect(eventPageUrl({ slug, code: 'th', uiLocale: 'en', origin: 'https://x.app' }))
      .toBe(`https://x.app/en/events/${slug}?lang=th`)
    expect(eventPageUrl({ slug, code: 'fr', uiLocale: 'en', origin: 'https://x.app' }))
      .toBe(`https://x.app/fr/events/${slug}`)
  })

  it('carries the language onto sub-paths like /register', () => {
    expect(eventPageUrl({ slug, code: 'th', uiLocale: 'en', subPath: '/register' }))
      .toBe(`/en/events/${slug}/register?lang=th`)
    expect(eventPageUrl({ slug, code: 'es', uiLocale: 'en', subPath: '/register' }))
      .toBe(`/es/events/${slug}/register`)
  })

  it("builds a hidden type's private link to the EVENT PAGE, not the form", () => {
    // Whoever is handed this has had no other introduction to the event, and
    // the page is the only place that says what it is, when and where — and the
    // only one that explains itself when registration is closed.
    expect(
      eventPageUrl({ slug: 'thai-ccci', code: 'en', origin: 'https://x.test', params: { type: 'guest' } })
    ).toBe('https://x.test/en/events/thai-ccci?type=guest')
  })

  it('carries that type onward to the form', () => {
    // What the event page's Register button builds from the param it received.
    expect(
      eventPageUrl({ slug: 'thai-ccci', code: 'en', subPath: '/register', params: { type: 'guest' } })
    ).toBe('/en/events/thai-ccci/register?type=guest')
  })

  it('drops the type when there is none, rather than emitting an empty param', () => {
    expect(eventPageUrl({ slug: 'thai-ccci', code: 'en', params: { type: undefined } }))
      .toBe('/en/events/thai-ccci')
  })

  it('keeps a custom language alongside the type', () => {
    const href = eventPageUrl({ slug: 'thai-ccci', code: 'th', uiLocale: 'en', params: { type: 'guest' } })
    expect(href).toContain('lang=th')
    expect(href).toContain('type=guest')
  })

  it('omits the query when no language is given', () => {
    expect(eventPageUrl({ slug, uiLocale: 'en' })).toBe(`/en/events/${slug}`)
  })

  it('encodes unusual language codes', () => {
    expect(eventPageUrl({ slug, code: 'zh-TW', uiLocale: 'en' }))
      .toBe(`/en/events/${slug}?lang=zh-TW`)
  })

  it('stays a same-origin path, so the login round-trip accepts it', () => {
    const next = eventPageUrl({ slug, code: 'th', uiLocale: 'en', subPath: '/register' })
    expect(safeNextPath(next, '/')).toBe(next)
  })
})

describe('externalHref', () => {
  it('prepends https:// to a bare domain (the reported bug)', () => {
    expect(externalHref('cru.org')).toBe('https://cru.org')
    expect(externalHref('www.cru.org/give?x=1')).toBe('https://www.cru.org/give?x=1')
    expect(externalHref('  cru.org  ')).toBe('https://cru.org')
  })
  it('keeps an existing http/https scheme', () => {
    expect(externalHref('http://cru.org')).toBe('http://cru.org')
    expect(externalHref('https://cru.org/path')).toBe('https://cru.org/path')
    expect(externalHref('HTTPS://Cru.org')).toBe('HTTPS://Cru.org')
  })
  it('allows mailto/tel', () => {
    expect(externalHref('mailto:a@b.org')).toBe('mailto:a@b.org')
    expect(externalHref('tel:+15550100')).toBe('tel:+15550100')
  })
  it('handles protocol-relative URLs', () => {
    expect(externalHref('//cdn.example.com/x')).toBe('https://cdn.example.com/x')
  })
  it('rejects dangerous schemes', () => {
    expect(externalHref('javascript:alert(1)')).toBe(null)
    expect(externalHref('data:text/html,<script>')).toBe(null)
  })
  it('returns null for empty/invalid input', () => {
    expect(externalHref('')).toBe(null)
    expect(externalHref('   ')).toBe(null)
    expect(externalHref(null)).toBe(null)
    expect(externalHref(undefined)).toBe(null)
    expect(externalHref(42)).toBe(null)
  })
})

describe('safeNextPath', () => {
  it('keeps a same-origin path, query and all', () => {
    expect(safeNextPath('/en/events/summit/register', '/en')).toBe('/en/events/summit/register')
    expect(safeNextPath('/en/events/summit/register?lang=pt', '/en')).toBe(
      '/en/events/summit/register?lang=pt'
    )
  })
  it('rejects protocol-relative values that would leave the site', () => {
    expect(safeNextPath('//evil.com', '/en')).toBe('/en')
    expect(safeNextPath('//evil.com/en/console', '/en')).toBe('/en')
    expect(safeNextPath('/\\evil.com', '/en')).toBe('/en')
  })
  it('rejects absolute URLs and non-paths', () => {
    expect(safeNextPath('https://evil.com', '/en')).toBe('/en')
    expect(safeNextPath('javascript:alert(1)', '/en')).toBe('/en')
    expect(safeNextPath('en/console', '/en')).toBe('/en')
  })
  it('rejects control characters that could split the Location header', () => {
    expect(safeNextPath('/en\r\nSet-Cookie: a=b', '/en')).toBe('/en')
  })
  it('falls back for missing input', () => {
    expect(safeNextPath(null, '/en')).toBe('/en')
    expect(safeNextPath(undefined, '/en')).toBe('/en')
    expect(safeNextPath('', '/en')).toBe('/en')
  })
})

describe('eventPageUrl params + withParam', () => {
  it('adds extra params alongside a platform locale route', () => {
    expect(
      eventPageUrl({ slug: 'camp', code: 'ru', subPath: '/register', params: { type: 'staff' } })
    ).toBe('/ru/events/camp/register?type=staff')
  })

  it('keeps ?lang= for a custom language and adds the param to it', () => {
    expect(
      eventPageUrl({
        slug: 'camp', code: 'th', uiLocale: 'en', subPath: '/register', params: { type: 'staff' },
      })
    ).toBe('/en/events/camp/register?lang=th&type=staff')
  })

  it('ignores empty params rather than emitting type=', () => {
    expect(eventPageUrl({ slug: 'camp', code: 'en', params: { type: undefined } })).toBe(
      '/en/events/camp'
    )
  })

  it('withParam appends to an href that already has a query', () => {
    expect(withParam('/en/events/camp/register?lang=th', 'type', 'vip')).toBe(
      '/en/events/camp/register?lang=th&type=vip'
    )
    expect(withParam('/en/events/camp/register', 'type', 'vip')).toBe(
      '/en/events/camp/register?type=vip'
    )
    expect(withParam('/en/events/camp/register?type=old', 'type', 'new')).toBe(
      '/en/events/camp/register?type=new'
    )
    expect(withParam('/en/events/camp/register?type=old', 'type', null)).toBe(
      '/en/events/camp/register'
    )
  })
})
