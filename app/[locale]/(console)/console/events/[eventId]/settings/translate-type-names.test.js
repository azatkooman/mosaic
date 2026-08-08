import { describe, expect, it, vi } from 'vitest'
import { translateTypeNames } from './translate-type-names'
import { MT_KEY, hashSource, targetNeedsTranslation } from '@/lib/form-localization'

// Echoes each string back tagged with its target, so assertions can tell which
// language a value came from without mocking the network.
const fakeTranslate = async (requests) =>
  Object.fromEntries(
    Object.entries(requests).map(([target, strings]) => [
      target,
      strings.map((s) => `${s} [${target}]`),
    ])
  )

const run = (types, opts = {}) =>
  translateTypeNames(types, {
    source: 'en',
    locales: ['en', 'th'],
    translate: fakeTranslate,
    ...opts,
  })

describe('translateTypeNames', () => {
  it('fills a custom language from the default one', async () => {
    const types = [{ id: '1', name: { en: 'Staff' } }, { id: '2', name: { en: 'Child' } }]
    const out = await run(types)
    expect(out.changed).toBe(true)
    expect(out.types[0].name.th).toBe('Staff [th]')
    expect(out.types[1].name.th).toBe('Child [th]')
    // Ids and every other field survive.
    expect(out.types.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('stamps machine output so a later rename refreshes it', async () => {
    const out = await run([{ name: { en: 'Staff' } }])
    const map = out.types[0].name
    expect(map[MT_KEY].th).toBe(hashSource('Staff'))
    expect(targetNeedsTranslation(map, 'en', 'th')).toBe(false)
    expect(targetNeedsTranslation({ ...map, en: 'Volunteer' }, 'en', 'th')).toBe(true)
  })

  it('translates only the type whose source text changed', async () => {
    const sent = []
    const settled = { en: 'Staff', th: 'พนักงาน', [MT_KEY]: { th: hashSource('Staff') } }
    const out = await run([{ name: settled }, { name: { en: 'Child' } }], {
      translate: async (requests) => {
        sent.push(...(requests.th ?? []))
        return fakeTranslate(requests)
      },
    })
    expect(sent).toEqual(['Child']) // not 'Staff' — it is already up to date
    expect(out.types[0].name.th).toBe('พนักงาน')
    expect(out.types[1].name.th).toBe('Child [th]')
  })

  // The settings form writes name[<console locale>], so an organizer working in
  // a Spanish console is hand-translating, not authoring a source.
  it('never overwrites a name typed in a non-default language', async () => {
    const typed = { en: 'Staff', th: 'ที่ฉันพิมพ์เอง' }
    const out = await run([{ name: typed }])
    // Unstamped text reads as human-authored and is protected forever.
    expect(out.types[0].name.th).toBe('ที่ฉันพิมพ์เอง')
  })

  it('does nothing when only a non-default language was edited', async () => {
    const translate = vi.fn(fakeTranslate)
    // No source text at all: nothing to translate FROM.
    const types = [{ name: { th: 'พนักงาน' } }]
    const out = await run(types, { translate })
    expect(translate).not.toHaveBeenCalled()
    expect(out.changed).toBe(false)
    expect(out.types).toBe(types) // same reference — caller can skip the write
  })

  it('costs no API call when every name is already up to date', async () => {
    const translate = vi.fn(fakeTranslate)
    const types = [
      { name: { en: 'Staff', th: 'พนักงาน', [MT_KEY]: { th: hashSource('Staff') } } },
    ]
    const out = await run(types, { translate })
    expect(translate).not.toHaveBeenCalled()
    expect(out.changed).toBe(false)
  })

  it('is a no-op for a single-language event', async () => {
    const translate = vi.fn(fakeTranslate)
    const types = [{ name: { en: 'Staff' } }]
    const out = await run(types, { locales: ['en'], translate })
    expect(translate).not.toHaveBeenCalled()
    expect(out.types).toBe(types)
  })

  it('tolerates a type with no name yet', async () => {
    const out = await run([{ id: '1' }, { id: '2', name: { en: 'Child' } }])
    expect(out.types[1].name.th).toBe('Child [th]')
  })

  it('lets a translation failure reach the caller rather than corrupting names', async () => {
    await expect(
      run([{ name: { en: 'Staff' } }], {
        translate: async () => {
          throw new Error('translate_failed')
        },
      })
    ).rejects.toThrow('translate_failed')
  })

  it('translates into every offered language, built-in and custom alike', async () => {
    const out = await run([{ name: { en: 'Staff' } }], { locales: ['en', 'es', 'th', 'yue'] })
    expect(out.types[0].name.es).toBe('Staff [es]')
    expect(out.types[0].name.th).toBe('Staff [th]')
    expect(out.types[0].name.yue).toBe('Staff [yue]')
  })
})
