import { describe, expect, it } from 'vitest'
import {
  MT_KEY,
  applyLocalizedTranslations,
  collectStaleStrings,
  hasStaleTranslations,
  hashSource,
  isLocaleMap,
  retranslateDocument,
  setLocalizedText,
  stampUntracked,
  stripLocales,
  targetNeedsTranslation,
} from './form-localization.js'
import { eventLocales, lt } from './i18n/locales.js'

// A translator that echoes a per-language prefix, so assertions can tell which
// run produced a given string.
function fakeTranslator(calls) {
  return async (requests) => {
    calls.push(requests)
    const out = {}
    for (const [target, strings] of Object.entries(requests)) {
      out[target] = strings.map((s) => `${target}:${s}`)
    }
    return out
  }
}

const run = (node, options) =>
  retranslateDocument(node, { translate: fakeTranslator(options.calls ?? []), ...options })

describe('isLocaleMap', () => {
  it('recognizes a map carrying provenance', () => {
    // Without exempting MT_KEY from the "all values are strings" check, every
    // stamped field would stop being recognized and silently never translate.
    expect(isLocaleMap({ en: 'Name', es: 'Nombre', [MT_KEY]: { es: 'abc' } })).toBe(true)
  })

  it('rejects a bare provenance object with no locale keys', () => {
    expect(isLocaleMap({ [MT_KEY]: { es: 'abc' } })).toBe(false)
  })

  it('still rejects plain objects and non-locale keys', () => {
    expect(isLocaleMap({ questions: [] })).toBe(false)
    expect(isLocaleMap({ en: 'Name', zz: 'Nope' })).toBe(false)
    expect(isLocaleMap(null)).toBe(false)
    expect(isLocaleMap(['en'])).toBe(false)
  })

  it('accepts custom language codes when a wider code set is passed', () => {
    const codes = new Set(['en', 'tg'])
    expect(isLocaleMap({ en: 'Name', tg: '' })).toBe(false)
    expect(isLocaleMap({ en: 'Name', tg: '' }, codes)).toBe(true)
  })
})

describe('hasStaleTranslations — drives the context-aware button', () => {
  const stamp = (source) => ({ [MT_KEY]: { es: hashSource(source) } })

  it('is true on a first run — every target is blank', () => {
    const doc = { label: { en: 'Name', es: '' } }
    expect(hasStaleTranslations(doc, 'en', ['es'])).toBe(true)
  })

  it('is true when a source string was edited after translating', () => {
    const doc = { label: { en: 'Full name', es: 'Nombre', ...stamp('Name') } }
    expect(hasStaleTranslations(doc, 'en', ['es'])).toBe(true)
  })

  it('is false once every field is up to date', () => {
    const doc = { label: { en: 'Name', es: 'Nombre', ...stamp('Name') } }
    expect(hasStaleTranslations(doc, 'en', ['es'])).toBe(false)
  })

  it('is false for hand-typed and pre-tracking content — the redo case', () => {
    // No stamp, filled target: reads as human-authored, which is exactly when
    // the button should offer a forced redo instead of a safe pass.
    const doc = { label: { en: 'Name', es: 'Nombre propio' } }
    expect(hasStaleTranslations(doc, 'en', ['es'])).toBe(false)
  })

  it('is true if any one target of several is stale', () => {
    const doc = { label: { en: 'Name', es: 'Nombre', fr: '', ...stamp('Name') } }
    expect(hasStaleTranslations(doc, 'en', ['es', 'fr'])).toBe(true)
  })
})

describe('targetNeedsTranslation', () => {
  const stamp = (source) => ({ [MT_KEY]: { es: hashSource(source) } })

  it('skips a field with no source text', () => {
    expect(targetNeedsTranslation({ en: '   ', es: '' }, 'en', 'es')).toBe(false)
  })

  it('translates an empty target slot', () => {
    expect(targetNeedsTranslation({ en: 'Name', es: '' }, 'en', 'es')).toBe(true)
  })

  it('skips a translation that matches the current source', () => {
    expect(
      targetNeedsTranslation({ en: 'Name', es: 'Nombre', ...stamp('Name') }, 'en', 'es')
    ).toBe(false)
  })

  it('retranslates once the source text has changed', () => {
    expect(
      targetNeedsTranslation({ en: 'Full name', es: 'Nombre', ...stamp('Name') }, 'en', 'es')
    ).toBe(true)
  })

  it('protects text with no stamp — a human typed it', () => {
    expect(targetNeedsTranslation({ en: 'Name', es: 'Nombre propio' }, 'en', 'es')).toBe(false)
  })

  it('overrides every guard under force, including the human-authored one', () => {
    expect(
      targetNeedsTranslation({ en: 'Name', es: 'Nombre propio' }, 'en', 'es', { force: true })
    ).toBe(true)
    // ...but never invents a translation for an empty source.
    expect(targetNeedsTranslation({ en: '', es: '' }, 'en', 'es', { force: true })).toBe(false)
  })
})

describe('the three organizer-visible behaviours', () => {
  const definition = () => ({
    questions: [
      {
        id: 'q_name',
        type: 'text',
        label: { en: 'Name', es: '', fr: '' },
        help: { en: 'Your full name', es: '', fr: '' },
      },
      {
        id: 'q_role',
        type: 'select',
        label: { en: 'Role', es: '', fr: '' },
        options: [
          { value: 'staff', label: { en: 'Staff', es: '', fr: '' } },
          { value: 'guest', label: { en: 'Guest', es: '', fr: '' } },
        ],
      },
    ],
  })

  const opts = (extra) => ({
    source: 'en',
    targets: ['es', 'fr'],
    locales: ['en', 'es', 'fr'],
    ...extra,
  })

  it('1) the first run translates every field', async () => {
    const calls = []
    const { node, translated } = await run(definition(), opts({ calls }))

    expect(calls).toHaveLength(1)
    expect(calls[0].es).toEqual(['Name', 'Your full name', 'Role', 'Staff', 'Guest'])
    expect(calls[0].fr).toEqual(['Name', 'Your full name', 'Role', 'Staff', 'Guest'])
    expect(translated).toBe(10)
    expect(node.questions[0].label.es).toBe('es:Name')
    expect(node.questions[0].label.fr).toBe('fr:Name')
    expect(node.questions[1].options[1].label.es).toBe('es:Guest')
    expect(node.questions[0].label.en).toBe('Name')
  })

  it('2) a second run with no edits sends nothing at all', async () => {
    const calls = []
    const { node: first } = await run(definition(), opts({}))
    const { node: second, translated, changed } = await run(first, opts({ calls }))

    expect(calls).toHaveLength(0)
    expect(translated).toBe(0)
    expect(changed).toBe(false)
    expect(second).toBe(first)
  })

  it('2) a second run translates only the field whose source changed', async () => {
    const { node: first } = await run(definition(), opts({}))

    // The organizer rewrites one label in the default language.
    const edited = structuredClone(first)
    edited.questions[0].label = setLocalizedText(
      edited.questions[0].label,
      'en',
      'Full legal name',
      'en'
    )

    const calls = []
    const { node, translated } = await run(edited, opts({ calls }))

    expect(calls).toHaveLength(1)
    expect(calls[0].es).toEqual(['Full legal name'])
    expect(calls[0].fr).toEqual(['Full legal name'])
    expect(translated).toBe(2)
    expect(node.questions[0].label.es).toBe('es:Full legal name')
    // Everything else keeps the translation from the first run, untouched.
    expect(node.questions[0].help.es).toBe('es:Your full name')
    expect(node.questions[1].options[0].label.fr).toBe('fr:Staff')
  })

  it('3) adding a language translates all of it, plus edited fields elsewhere', async () => {
    const { node: first } = await run(definition(), opts({}))

    const edited = structuredClone(first)
    edited.questions[1].label = setLocalizedText(edited.questions[1].label, 'en', 'Job role', 'en')

    const calls = []
    const { node } = await run(
      edited,
      opts({
        calls,
        targets: ['es', 'fr', 'de'],
        locales: ['en', 'es', 'fr', 'de'],
      })
    )

    // The new language needs the whole form...
    expect(calls[0].de).toEqual(['Name', 'Your full name', 'Job role', 'Staff', 'Guest'])
    // ...while the established ones need only the edited field. A single shared
    // string list would have retranslated the entire form in every language.
    expect(calls[0].es).toEqual(['Job role'])
    expect(calls[0].fr).toEqual(['Job role'])
    expect(node.questions[0].label.de).toBe('de:Name')
    expect(node.questions[1].label.es).toBe('es:Job role')
    expect(node.questions[0].label.es).toBe('es:Name')
  })
})

describe('protecting text the organizer typed', () => {
  const opts = { source: 'en', targets: ['es'], locales: ['en', 'es'] }

  it('never overwrites a hand-edited translation, even after the source changes', async () => {
    const { node: first } = await run(
      { label: { en: 'Name', es: '' } },
      { ...opts, calls: [] }
    )
    expect(first.label.es).toBe('es:Name')

    // The organizer rewrites the Spanish by hand, which clears its stamp.
    const handEdited = { label: setLocalizedText(first.label, 'es', 'Nombre propio', 'en') }
    expect(handEdited.label[MT_KEY]?.es).toBeUndefined()

    // ...then changes the English. The Spanish must survive.
    const sourceChanged = { label: setLocalizedText(handEdited.label, 'en', 'Full name', 'en') }
    const calls = []
    const { node, translated } = await run(sourceChanged, { ...opts, calls })

    expect(calls).toHaveLength(0)
    expect(translated).toBe(0)
    expect(node.label.es).toBe('Nombre propio')
  })

  it('force is the way back from a hand-edit', async () => {
    const node = { label: { en: 'Full name', es: 'Nombre propio' } }
    const calls = []
    const { node: out } = await run(node, { ...opts, calls, force: true })

    expect(calls[0].es).toEqual(['Full name'])
    expect(out.label.es).toBe('es:Full name')
  })

  it('editing the source language leaves stamps intact so the field reads as modified', () => {
    const map = { en: 'Name', es: 'Nombre', [MT_KEY]: { es: hashSource('Name') } }
    const next = setLocalizedText(map, 'en', 'Full name', 'en')
    expect(next[MT_KEY].es).toBe(hashSource('Name'))
    expect(targetNeedsTranslation(next, 'en', 'es')).toBe(true)
  })
})

describe('adopting content that predates provenance tracking', () => {
  it('treats existing translations as current instead of re-billing for them', async () => {
    const legacy = { label: { en: 'Name', es: 'Nombre', fr: '' } }
    const calls = []
    const { node, translated } = await run(legacy, {
      source: 'en',
      targets: ['es', 'fr'],
      locales: ['en', 'es', 'fr'],
      calls,
    })

    // Only the empty French slot is sent; the existing Spanish is adopted.
    expect(calls[0]).toEqual({ fr: ['Name'] })
    expect(translated).toBe(1)
    expect(node.label.es).toBe('Nombre')
    expect(node.label[MT_KEY].es).toBe(hashSource('Name'))
  })

  it('reports changed on an adopt-only run so the stamps get persisted', async () => {
    // Dropping this write would let the next run adopt against a by-then-edited
    // source, marking the stale translation fresh forever.
    const legacy = { label: { en: 'Name', es: 'Nombre' } }
    const { node, changed, translated } = await run(legacy, {
      source: 'en',
      targets: ['es'],
      locales: ['en', 'es'],
      calls: [],
    })

    expect(translated).toBe(0)
    expect(changed).toBe(true)
    expect(node.label[MT_KEY].es).toBe(hashSource('Name'))
  })

  it('adopts for every language, not just the current run targets', () => {
    // A form translated one language tab at a time calls this with a single
    // target. Stamping only that target would leave the others unstamped inside
    // an already-stamped map — which reads as human-authored, freezing them.
    const stamped = stampUntracked(
      { label: { en: 'Name', es: 'Nombre', fr: 'Nom' } },
      'en',
      ['en', 'es', 'fr']
    )
    expect(stamped.label[MT_KEY]).toEqual({ es: hashSource('Name'), fr: hashSource('Name') })
  })
})

describe('the provenance key stays invisible to the rest of the app', () => {
  // The one real hazard of storing bookkeeping inside a locale map: something
  // that treats every key as a language code would show `_mt` to organizers.
  it('is never resolved as text', () => {
    const map = { en: 'Name', es: 'Nombre', [MT_KEY]: { es: hashSource('Name') } }
    expect(lt(map, 'es', 'en')).toBe('Nombre')
    expect(lt(map, 'de', 'en')).toBe('Name')
  })

  it('is never offered as one of an event’s languages', () => {
    const event = {
      name: { en: 'Summit', es: 'Cumbre', [MT_KEY]: { es: hashSource('Summit') } },
      default_locale: 'en',
    }
    // No supported_locales and no page_content.i18n, so eventLocales falls back
    // to "locales that have a name filled in" — the path that reads raw keys.
    expect(eventLocales(event)).toEqual(['en', 'es'])
  })
})

describe('resilience', () => {
  const opts = { source: 'en', targets: ['es', 'fr'], locales: ['en', 'es', 'fr'] }

  it('leaves a field and its stamp alone when the provider drops a language', async () => {
    const { node, translated } = await retranslateDocument(
      { label: { en: 'Name', es: '', fr: '' } },
      { ...opts, translate: async () => ({ es: ['Nombre'] }) }
    )

    expect(node.label.es).toBe('Nombre')
    expect(node.label.fr).toBe('')
    expect(node.label[MT_KEY]).toEqual({ es: hashSource('Name') })
    expect(translated).toBe(1)
  })

  it('discards a misaligned response rather than pairing the wrong strings', async () => {
    const { node, translated } = await retranslateDocument(
      { a: { en: 'One', es: '' }, b: { en: 'Two', es: '' } },
      { ...opts, targets: ['es'], translate: async () => ({ es: ['Uno'] }) }
    )

    expect(translated).toBe(0)
    expect(node.a.es).toBe('')
    expect(node.b.es).toBe('')
  })

  it('preserves object identity when a run writes nothing', () => {
    const node = { label: { en: 'Name', es: 'Nombre', [MT_KEY]: { es: hashSource('Name') } } }
    expect(applyLocalizedTranslations(node, 'en', ['es'], {})).toBe(node)
    expect(collectStaleStrings(node, 'en', ['es'])).toEqual({})
  })

  it('handles custom language codes end to end', async () => {
    const codes = ['en', 'tg']
    const calls = []
    const { node } = await run(
      { label: { en: 'Name', tg: '' } },
      { source: 'en', targets: ['tg'], locales: codes, calls }
    )
    expect(calls[0].tg).toEqual(['Name'])
    expect(node.label.tg).toBe('tg:Name')
  })

  it('dedupes identical source strings into one request', async () => {
    const calls = []
    await run(
      { a: { en: 'Name', es: '' }, b: { en: 'Name', es: '' } },
      { source: 'en', targets: ['es'], locales: ['en', 'es'], calls }
    )
    expect(calls[0].es).toEqual(['Name'])
  })
})

describe('stripLocales', () => {
  const codes = new Set(['en', 'es', 'fr', 'ru', 'uk', 'th'])

  it('deletes the dropped language from nested locale maps', () => {
    const definition = {
      questions: [
        {
          id: 'q_name',
          label: { en: 'Name', th: 'ชื่อ' },
          options: [{ value: 'a', label: { en: 'Staff', th: 'พนักงาน' } }],
        },
      ],
    }
    const out = stripLocales(definition, new Set(['th']), codes)
    expect(out.questions[0].label).toEqual({ en: 'Name' })
    expect(out.questions[0].options[0].label).toEqual({ en: 'Staff' })
  })

  it('leaves other languages, non-locale objects and ids untouched', () => {
    const content = {
      hero: { heading: { en: 'Hi', es: 'Hola', th: 'สวัสดี' } },
      theme: { title_size: 'lg', primary_color: '#146b5c' },
      i18n: { available: ['en', 'es'], custom: [{ code: 'th', name: 'Thai' }] },
    }
    const out = stripLocales(content, new Set(['th']), codes)
    expect(out.hero.heading).toEqual({ en: 'Hi', es: 'Hola' })
    expect(out.theme).toEqual({ title_size: 'lg', primary_color: '#146b5c' })
    // The language bookkeeping itself is a plain list/record, not translated text.
    expect(out.i18n.custom).toEqual([{ code: 'th', name: 'Thai' }])
  })

  it('re-adding a language cannot resurrect the old translation', () => {
    // Translating only ever fills EMPTY slots, so a leftover value would stick
    // around forever. Stripping is what forces a fresh translation.
    const before = { title: { en: 'Welcome', th: 'ยินดีต้อนรับ' } }
    const purged = stripLocales(before, new Set(['th']), codes)
    expect(purged.title.th).toBeUndefined()

    const retranslated = applyLocalizedTranslations(
      purged,
      'en',
      ['th'],
      { th: new Map([['Welcome', 'ยินดีต้อนรับใหม่']]) },
      codes
    )
    expect(retranslated.title.th).toBe('ยินดีต้อนรับใหม่')
  })

  it('is a no-op when nothing was removed', () => {
    const node = { label: { en: 'Name', th: 'ชื่อ' } }
    expect(stripLocales(node, new Set(), codes)).toBe(node)
  })

  it('takes the dropped language’s provenance stamp with it', () => {
    // A stamp naming a language the event no longer offers would outlive every
    // other trace of it.
    const node = {
      label: { en: 'Name', es: 'Nombre', th: 'ชื่อ', [MT_KEY]: { es: 'aaa', th: 'bbb' } },
    }
    const out = stripLocales(node, new Set(['th']), codes)
    expect(out.label).toEqual({ en: 'Name', es: 'Nombre', [MT_KEY]: { es: 'aaa' } })
  })

  it('drops the stamps entirely when no language is left', () => {
    const node = { label: { th: 'ชื่อ', [MT_KEY]: { th: 'bbb' } } }
    expect(stripLocales(node, new Set(['th']), codes)).toEqual({ label: {} })
  })
})
