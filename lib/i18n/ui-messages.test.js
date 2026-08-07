import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import {
  UI_NAMESPACES,
  applyUiTranslations,
  flattenMessages,
  mergeMessages,
  pickUiMessages,
  placeholdersIntact,
  placeholdersOf,
  protectPlaceholders,
  restorePlaceholders,
  staleUiKeys,
  unflattenMessages,
} from './ui-messages.js'
import { hashSource } from '../form-localization.js'
import enMessages from '../../messages/en.json'

const SOURCE = { wizard: { modeTitle: 'Single or group?', title: 'Register for {event}' } }

describe('pickUiMessages', () => {
  it('keeps the attendee namespaces and drops the rest', () => {
    const out = pickUiMessages(enMessages)
    expect(Object.keys(out).sort()).toEqual([...UI_NAMESPACES].sort())
    // The reason the list exists: `console` is 558 of the catalog's 758 keys and
    // no attendee ever sees it.
    expect(out.console).toBeUndefined()
    expect(out.wizard.modeSingle).toBe('Single registration')
  })

  it('tolerates a catalog missing a namespace', () => {
    expect(pickUiMessages({ wizard: { a: 'b' } })).toEqual({ wizard: { a: 'b' } })
    expect(pickUiMessages(null)).toEqual({})
  })
})

describe('flatten / unflatten', () => {
  it('round-trips a nested tree', () => {
    const flat = flattenMessages(SOURCE)
    expect(flat).toEqual({
      'wizard.modeTitle': 'Single or group?',
      'wizard.title': 'Register for {event}',
    })
    expect(unflattenMessages(flat)).toEqual(SOURCE)
  })

  it('round-trips the real catalog subset without loss', () => {
    const picked = pickUiMessages(enMessages)
    expect(unflattenMessages(flattenMessages(picked))).toEqual(picked)
  })

  it('ignores non-string leaves', () => {
    expect(flattenMessages({ a: 1, b: null, c: 'keep', d: ['x'] })).toEqual({ c: 'keep' })
  })
})

describe('placeholders', () => {
  it('finds ICU placeholders and ignores prose braces', () => {
    expect(placeholdersOf('Participant {index} of {total}')).toEqual(['index', 'total'])
    expect(placeholdersOf('No placeholders here')).toEqual([])
  })

  // The failure this guards against: next-intl parses these as ICU, so a
  // translator that renames or drops a placeholder turns a label into a crash.
  it('rejects a translation that changed the placeholders', () => {
    expect(placeholdersIntact('Register for {event}', 'Inscribirse en {event}')).toBe(true)
    expect(placeholdersIntact('Register for {event}', 'Inscribirse en {evento}')).toBe(false)
    expect(placeholdersIntact('Register for {event}', 'Inscribirse')).toBe(false)
    expect(placeholdersIntact('Register for {event}', 'Inscribirse en { event }')).toBe(true)
  })
})

/**
 * The bug these exist for: Google translated the WORD inside the braces for
 * Arabic and Cantonese, so `wizard.title` was rejected and rendered in English
 * while everything around it was translated. Masking removes the word.
 */
describe('protect / restore placeholders', () => {
  it('masks names as indices and puts them back', () => {
    const { masked, names } = protectPlaceholders('Participant {index} of {total}')
    expect(masked).toBe('Participant {0} of {1}')
    expect(names).toEqual(['index', 'total'])
    expect(restorePlaceholders(masked, names)).toBe('Participant {index} of {total}')
  })

  it('leaves a string with no placeholders alone', () => {
    const { masked, names } = protectPlaceholders('Single registration')
    expect(masked).toBe('Single registration')
    expect(names).toEqual([])
    expect(restorePlaceholders('Inscripción individual', names)).toBe('Inscripción individual')
  })

  // Kazakh puts the placeholder first, Arabic reorders — restoring by index is
  // what makes that correct rather than merely tolerated.
  it('restores correctly when the translator moves the placeholder', () => {
    const { masked, names } = protectPlaceholders('Register for {event}')
    expect(masked).toBe('Register for {0}')
    expect(restorePlaceholders('{0}-ке тіркеліңіз', names)).toBe('{event}-ке тіркеліңіз')
  })

  it('restores correctly when the translator SWAPS two placeholders', () => {
    const { masked, names } = protectPlaceholders('Participant {index} of {total}')
    // A naive positional repair would produce "{total} … {index}" here.
    expect(restorePlaceholders('{1} من {0} مشارك', names)).toBe('{total} من {index} مشارك')
  })

  it('gives up when a token was dropped or renamed', () => {
    const { names } = protectPlaceholders('Participant {index} of {total}')
    expect(restorePlaceholders('مشارك {0}', names)).toBeNull() // one lost
    expect(restorePlaceholders('مشارك {الفهرس} من {0}', names)).toBeNull() // renamed
    expect(restorePlaceholders('مشارك', names)).toBeNull() // both lost
    expect(restorePlaceholders('{0} من {9}', names)).toBeNull() // invented index
    expect(restorePlaceholders(undefined, names)).toBeNull()
  })

  it('tolerates whitespace the translator adds inside a token', () => {
    const { names } = protectPlaceholders('Register for {event}')
    expect(restorePlaceholders('التسجيل في { 0 }', names)).toBe('التسجيل في {event}')
  })

  it('round-trips every interpolating string in the real catalog', () => {
    const flat = flattenMessages(pickUiMessages(enMessages))
    const interpolating = Object.entries(flat).filter(([, v]) => placeholdersOf(v).length > 0)
    // The five known ones; a new interpolating key should show up here.
    expect(interpolating.length).toBe(5)
    for (const [path, source] of interpolating) {
      const { masked, names } = protectPlaceholders(source)
      expect(masked, path).not.toContain('{event')
      expect(restorePlaceholders(masked, names), path).toBe(source)
      expect(placeholdersIntact(source, restorePlaceholders(masked, names)), path).toBe(true)
    }
  })
})

describe('staleUiKeys', () => {
  const flat = flattenMessages(SOURCE)

  it('treats everything as stale for a language with no cache', () => {
    expect(staleUiKeys(flat, null)).toEqual(['wizard.modeTitle', 'wizard.title'])
  })

  it('returns nothing when every key is cached against the current source', () => {
    const cached = {
      messages: { wizard: { modeTitle: 'ก', title: 'ข {event}' } },
      source_hashes: {
        'wizard.modeTitle': hashSource(SOURCE.wizard.modeTitle),
        'wizard.title': hashSource(SOURCE.wizard.title),
      },
    }
    expect(staleUiKeys(flat, cached)).toEqual([])
  })

  it('marks exactly the reworded key stale, not the whole catalog', () => {
    const cached = {
      messages: { wizard: { modeTitle: 'ก', title: 'ข {event}' } },
      source_hashes: {
        'wizard.modeTitle': hashSource('Some older wording'),
        'wizard.title': hashSource(SOURCE.wizard.title),
      },
    }
    expect(staleUiKeys(flat, cached)).toEqual(['wizard.modeTitle'])
  })

  it('marks text cached without a hash stale rather than trusting it', () => {
    const cached = { messages: { wizard: { modeTitle: 'ก' } }, source_hashes: {} }
    expect(staleUiKeys(flat, cached)).toContain('wizard.modeTitle')
  })
})

describe('applyUiTranslations', () => {
  const flat = flattenMessages(SOURCE)

  it('stores translations and stamps them against the source', () => {
    const out = applyUiTranslations(null, flat, {
      'wizard.modeTitle': 'เดี่ยวหรือกลุ่ม?',
      'wizard.title': 'ลงทะเบียนสำหรับ {event}',
    })
    expect(out.messages.wizard.modeTitle).toBe('เดี่ยวหรือกลุ่ม?')
    expect(out.source_hashes['wizard.title']).toBe(hashSource(SOURCE.wizard.title))
    expect(out.applied).toBe(2)
    expect(out.rejected).toEqual([])
    // A second run has nothing to do.
    expect(staleUiKeys(flat, out)).toEqual([])
  })

  it('drops a mangled placeholder and leaves the key retryable', () => {
    const out = applyUiTranslations(null, flat, {
      'wizard.modeTitle': 'เดี่ยวหรือกลุ่ม?',
      'wizard.title': 'ลงทะเบียนสำหรับ {เหตุการณ์}',
    })
    expect(out.rejected).toEqual(['wizard.title'])
    expect(out.messages.wizard.title).toBeUndefined()
    expect(out.applied).toBe(1)
    // Not recorded as done, so the next run tries again.
    expect(staleUiKeys(flat, out)).toEqual(['wizard.title'])
  })

  it('forgets keys that have left the catalog', () => {
    const cached = {
      messages: { wizard: { modeTitle: 'ก', removedKey: 'ค' } },
      source_hashes: { 'wizard.modeTitle': hashSource(SOURCE.wizard.modeTitle), 'wizard.removedKey': 'x' },
    }
    const out = applyUiTranslations(cached, flat, {})
    expect(out.messages.wizard.removedKey).toBeUndefined()
    expect(out.source_hashes['wizard.removedKey']).toBeUndefined()
    expect(out.messages.wizard.modeTitle).toBe('ก')
  })
})

describe('mergeMessages', () => {
  it('lays overrides over the base without dropping untranslated keys', () => {
    const base = { wizard: { a: 'A', b: 'B' }, common: { next: 'Next' } }
    const out = mergeMessages(base, { wizard: { a: 'ก' } })
    expect(out.wizard.a).toBe('ก')
    expect(out.wizard.b).toBe('B') // fallback: the route locale's wording
    expect(out.common.next).toBe('Next')
  })

  it('returns the base unchanged when there is nothing to merge', () => {
    const base = { wizard: { a: 'A' } }
    expect(mergeMessages(base, {})).toBe(base)
    expect(mergeMessages(base, null)).toBe(base)
  })

  it('does not mutate the base', () => {
    const base = { wizard: { a: 'A' } }
    mergeMessages(base, { wizard: { a: 'ก' } })
    expect(base.wizard.a).toBe('A')
  })
})

/**
 * The point of the whole change: a merged catalog must render through the real
 * next-intl translator the pages use, including ICU interpolation, with the
 * formatting locale left on a platform locale.
 */
describe('a merged catalog through next-intl', () => {
  it('renders cached text and falls back per key', () => {
    const base = pickUiMessages(enMessages)
    const cached = {
      wizard: { modeTitle: 'เดี่ยวหรือกลุ่ม?', title: 'ลงทะเบียนสำหรับ {event}' },
      runtime: { phoneCountryCode: 'รหัสประเทศ' },
    }
    const messages = mergeMessages(base, cached)

    const t = createTranslator({ locale: 'en', messages, namespace: 'wizard' })
    expect(t('modeTitle')).toBe('เดี่ยวหรือกลุ่ม?')
    // Interpolation survives the swap — the reason placeholders are validated.
    expect(t('title', { event: 'งานสัมมนา' })).toBe('ลงทะเบียนสำหรับ งานสัมมนา')
    // A key the cache never got still renders, in the route locale.
    expect(t('modeSingle')).toBe('Single registration')

    const tr = createTranslator({ locale: 'en', messages, namespace: 'runtime' })
    expect(tr('phoneCountryCode')).toBe('รหัสประเทศ')
    expect(tr('address_postalCode')).toBe('Postal code')
  })

  it('covers the strings the registration flow actually shows', () => {
    // Every namespace the wizard, the form runtime and the confirmation read.
    for (const ns of ['wizard', 'common', 'runtime', 'validation', 'myRegs', 'status']) {
      expect(UI_NAMESPACES).toContain(ns)
      expect(pickUiMessages(enMessages)[ns]).toBeTruthy()
    }
  })
})
