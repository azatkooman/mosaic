import { describe, expect, it } from 'vitest'
import { applyLocalizedTranslations, collectLocalizedStrings } from './form-localization.js'

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