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

  it('does not touch address/validation config objects (not locale maps)', () => {
    const def = {
      questions: [
        {
          id: 'q_addr',
          type: 'address',
          label: { en: 'Address' },
          addressParts: { line1: { enabled: true, required: true }, city: { enabled: true } },
          validation: { maxLength: 5 },
        },
      ],
    }
    const set = new Set()
    collectLocalizedStrings(def, 'en', set, ['en', 'es', 'pt'])
    expect([...set]).toEqual(['Address']) // only the label, never the config keys
  })

  describe('custom (organizer-added) languages', () => {
    // A form partly authored in a custom language: label carries an 'pt' key.
    const def = () => ({
      questions: [
        { id: 'q1', type: 'text', label: { en: 'Name', pt: 'Nome' } },
        { id: 'q2', type: 'text', label: { en: 'Email' } },
      ],
    })

    it('WITHOUT the allowed set, a map containing a custom code is invisible (the old bug)', () => {
      const set = new Set()
      collectLocalizedStrings(def(), 'en', set)
      // {en, pt} fails the built-in-only check, so "Name" is missed; only the
      // plain {en} map is collected.
      expect([...set]).toEqual(['Email'])
    })

    it('WITH the event language set, custom-keyed maps are collected', () => {
      const allowed = ['en', 'es', 'fr', 'ru', 'uk', 'pt']
      const set = new Set()
      collectLocalizedStrings(def(), 'en', set, allowed)
      expect([...set].sort()).toEqual(['Email', 'Name'])
    })

    it('translates INTO a custom language, filling only empty slots', () => {
      const allowed = ['en', 'es', 'fr', 'ru', 'uk', 'pt']
      const translations = { pt: new Map([['Name', 'Nome-PT'], ['Email', 'E-mail']]) }
      const out = applyLocalizedTranslations(def(), 'en', ['pt'], translations, allowed)
      // q1 already had a manual pt value → preserved; q2's pt filled in.
      expect(out.questions[0].label.pt).toBe('Nome')
      expect(out.questions[1].label.pt).toBe('E-mail')
    })

    it('fills a built-in target even when the map already has a custom key', () => {
      const allowed = ['en', 'es', 'fr', 'ru', 'uk', 'pt']
      const translations = { es: new Map([['Name', 'Nombre'], ['Email', 'Correo']]) }
      const out = applyLocalizedTranslations(def(), 'en', ['es'], translations, allowed)
      expect(out.questions[0].label.es).toBe('Nombre') // was skipped before the fix
    })
  })
})