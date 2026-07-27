import { describe, expect, it } from 'vitest'
import {
  applyLocalizedTranslations,
  collectLocalizedStrings,
  stripLocales,
} from './form-localization.js'

describe('form localization helpers', () => {
  const definition = {
    questions: [
      {
        id: 'q_name',
        type: 'text',
        label: { en: 'Name', es: '', fr: 'Nom' },
        help: { en: 'Your full name', es: '', fr: '' },
      },
      {
        id: 'q_choice',
        type: 'select',
        label: { en: 'Role', es: '', fr: '' },
        options: [
          { value: 'staff', label: { en: 'Staff', es: '', fr: 'Équipe' } },
          { value: 'guest', label: { en: 'Guest', es: 'Invitado', fr: '' } },
        ],
      },
    ],
  }

  it('collects unique source strings from the selected locale', () => {
    const set = new Set()
    collectLocalizedStrings(definition, 'en', set)
    expect([...set]).toEqual(['Name', 'Your full name', 'Role', 'Staff', 'Guest'])
  })

  it('fills only empty target slots and keeps user-entered text', () => {
    const translations = {
      es: new Map([
        ['Name', 'Nombre'],
        ['Your full name', 'Tu nombre completo'],
        ['Role', 'Rol'],
        ['Staff', 'Equipo'],
        ['Guest', 'Invitado'],
      ]),
      fr: new Map([
        ['Name', 'Nom'],
        ['Your full name', 'Votre nom complet'],
        ['Role', 'Rôle'],
        ['Staff', 'Équipe'],
        ['Guest', 'Invité'],
      ]),
    }

    const translated = applyLocalizedTranslations(definition, 'en', ['es', 'fr'], translations)

    expect(translated.questions[0].label.es).toBe('Nombre')
    expect(translated.questions[0].label.fr).toBe('Nom')
    expect(translated.questions[0].help.es).toBe('Tu nombre completo')
    expect(translated.questions[0].help.fr).toBe('Votre nom complet')
    expect(translated.questions[1].label.es).toBe('Rol')
    expect(translated.questions[1].options[0].label.fr).toBe('Équipe')
    expect(translated.questions[1].options[1].label.es).toBe('Invitado')
    expect(translated.questions[1].options[0].label.en).toBe('Staff')
  })

  it('does not overwrite a filled target locale slot', () => {
    const definitionWithUserText = {
      questions: [
        {
          id: 'q_name',
          type: 'text',
          label: { en: 'Name', es: 'Nombre propio' },
        },
      ],
    }
    const translations = { es: new Map([['Name', 'Nombre']]) }

    const translated = applyLocalizedTranslations(definitionWithUserText, 'en', ['es'], translations)
    expect(translated.questions[0].label.es).toBe('Nombre propio')
  })

  it('handles custom language codes when a wider code set is passed', () => {
    const codes = new Set(['en', 'tg', 'yo'])
    // A map that already contains a custom code ('tg').
    const def = {
      questions: [{ id: 'q1', type: 'text', label: { en: 'Name', tg: '' } }],
    }

    // The built-in-only default skips a map containing a non-built-in key...
    const builtinOnly = new Set()
    collectLocalizedStrings(def, 'en', builtinOnly)
    expect([...builtinOnly]).toEqual([])

    // ...but the wider code set recognizes it and collects the source string.
    const set = new Set()
    collectLocalizedStrings(def, 'en', set, codes)
    expect([...set]).toEqual(['Name'])

    // And translations fill the custom-language slot.
    const translations = { tg: new Map([['Name', 'Ном']]) }
    const translated = applyLocalizedTranslations(def, 'en', ['tg'], translations, codes)
    expect(translated.questions[0].label.tg).toBe('Ном')
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
})
