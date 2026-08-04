import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_FIELDS, withDefaultLabels } from './event-page-defaults.js'
import {
  MT_KEY,
  hashSource,
  retranslateDocument,
  targetNeedsTranslation,
} from './form-localization.js'
import { lt } from './i18n/locales.js'

const LABELS = {
  register: { en: 'Register', es: 'Inscribirse' },
  countdownLabel: { en: 'Starts in', es: 'Empieza en' },
  countdownDays: { en: 'days', es: 'días' },
  countdownHours: { en: 'hrs', es: 'h' },
  countdownMinutes: { en: 'min', es: 'min' },
  countdownSeconds: { en: 'sec', es: 'seg' },
  viewAgenda: { en: 'View agenda', es: 'Ver agenda' },
}

describe('withDefaultLabels', () => {
  it('fills all seven default slots on an empty page_content', () => {
    const out = withDefaultLabels({}, 'en', LABELS)
    expect(out.theme.register_btn_text.en).toBe('Register')
    expect(out.hero.countdown_label.en).toBe('Starts in')
    expect(out.hero.countdown_days_label.en).toBe('days')
    expect(out.hero.countdown_hours_label.en).toBe('hrs')
    expect(out.hero.countdown_minutes_label.en).toBe('min')
    expect(out.hero.countdown_seconds_label.en).toBe('sec')
    expect(out.agenda.button_text.en).toBe('View agenda')
  })

  it('covers every field the table declares', () => {
    const out = withDefaultLabels({}, 'en', LABELS)
    for (const { section, field } of DEFAULT_TEXT_FIELDS) {
      expect(out[section]?.[field]?.en, `${section}.${field}`).toBeTruthy()
    }
  })

  // The regression this design exists to avoid: seeding only the source would
  // let lt() fall back to it, showing English to a Spanish reader.
  it('seeds every supplied platform locale, not just the source', () => {
    const out = withDefaultLabels({}, 'en', LABELS)
    expect(out.theme.register_btn_text.es).toBe('Inscribirse')
    expect(out.hero.countdown_seconds_label.es).toBe('seg')
  })

  it('stamps seeded non-source locales against the source hash so edits refresh them', () => {
    const out = withDefaultLabels({}, 'en', LABELS)
    const map = out.theme.register_btn_text
    expect(map[MT_KEY].es).toBe(hashSource('Register'))
    // Up to date now...
    expect(targetNeedsTranslation(map, 'en', 'es')).toBe(false)
    // ...but a reworded source marks it stale rather than protected-forever.
    expect(targetNeedsTranslation({ ...map, en: 'Sign up' }, 'en', 'es')).toBe(true)
  })

  it('leaves a custom language empty so the translator fills it from the source', () => {
    const out = withDefaultLabels({}, 'en', LABELS)
    const map = out.theme.register_btn_text
    expect(map.th).toBeUndefined()
    expect(targetNeedsTranslation(map, 'en', 'th')).toBe(true)
  })

  it('never overwrites wording the organizer typed', () => {
    const typed = { theme: { register_btn_text: { en: 'Join us' } } }
    const out = withDefaultLabels(typed, 'en', LABELS)
    expect(out.theme.register_btn_text.en).toBe('Join us')
    // Their other languages are auto-translate's business, not ours.
    expect(out.theme.register_btn_text.es).toBeUndefined()
  })

  it('does not overwrite an existing translation while filling a blank source', () => {
    const partial = { theme: { register_btn_text: { es: 'Apúntate' } } }
    const out = withDefaultLabels(partial, 'en', LABELS)
    expect(out.theme.register_btn_text.en).toBe('Register')
    expect(out.theme.register_btn_text.es).toBe('Apúntate')
    // Untouched text stays unstamped, i.e. still protected as human-authored.
    expect(out.theme.register_btn_text[MT_KEY]?.es).toBeUndefined()
  })

  it('preserves unrelated content in the sections it touches', () => {
    const content = {
      hero: { variant: 'split', countdown_label: {} },
      theme: { btn_bg: '#123456' },
      about: { title: { en: 'About' } },
    }
    const out = withDefaultLabels(content, 'en', LABELS)
    expect(out.hero.variant).toBe('split')
    expect(out.theme.btn_bg).toBe('#123456')
    expect(out.about).toBe(content.about)
  })

  it('returns the same object when there is nothing to seed', () => {
    const done = withDefaultLabels({}, 'en', LABELS)
    expect(withDefaultLabels(done, 'en', LABELS)).toBe(done)
  })

  it('is a no-op when the source language has no built-in wording', () => {
    // An event defaulting to a custom language keeps the t() fallback rather
    // than being seeded with another language's text.
    const content = {}
    expect(withDefaultLabels(content, 'th', LABELS)).toBe(content)
  })

  it('tolerates missing content, source and labels', () => {
    expect(withDefaultLabels(undefined, 'en', LABELS).theme.register_btn_text.en).toBe('Register')
    expect(withDefaultLabels({}, '', LABELS)).toEqual({})
    expect(withDefaultLabels({}, 'en', null)).toEqual({})
  })
})

/**
 * The point of the whole change: seeded defaults must survive the real
 * translation pipeline and come out the far side as text a reader sees. This
 * asserts against the actual modules the editor and the page use — the
 * translator is faked, nothing else is.
 */
describe('seeded defaults through the translation pipeline', () => {
  // What EventPageView renders: lt() first, the i18n default only as fallback.
  const rendered = (map, contentLocale, defaultLocale, fallback) =>
    lt(map, contentLocale, defaultLocale) || fallback

  it('gives a custom language real translated text where it had none', async () => {
    const seeded = withDefaultLabels({}, 'en', LABELS)
    const map = seeded.theme.register_btn_text

    // Before: nothing to translate FROM, so a Thai reader got the UI fallback.
    expect(targetNeedsTranslation({}, 'en', 'th')).toBe(false)
    expect(targetNeedsTranslation(map, 'en', 'th')).toBe(true)

    const { node } = await retranslateDocument(seeded, {
      source: 'en',
      targets: ['th'],
      locales: ['en', 'es', 'th'],
      translate: async (requests) =>
        Object.fromEntries(
          Object.entries(requests).map(([target, strings]) => [
            target,
            strings.map((s) => `${s} [${target}]`),
          ])
        ),
    })

    expect(rendered(node.theme.register_btn_text, 'th', 'en', 'Register')).toBe('Register [th]')
    expect(rendered(node.hero.countdown_days_label, 'th', 'en', 'days')).toBe('days [th]')
  })

  it('leaves platform locales reading exactly as they do today', () => {
    const seeded = withDefaultLabels({}, 'en', LABELS)
    // A Spanish reader keeps Spanish — the regression this design avoids.
    expect(rendered(seeded.theme.register_btn_text, 'es', 'en', 'Inscribirse')).toBe('Inscribirse')
    expect(rendered(seeded.hero.countdown_seconds_label, 'es', 'en', 'seg')).toBe('seg')
    expect(rendered(seeded.theme.register_btn_text, 'en', 'en', 'Register')).toBe('Register')
  })

  it('refreshes a seeded language when the organizer rewords the source', async () => {
    const seeded = withDefaultLabels({}, 'en', LABELS)
    // Organizer edits the source text in the editor.
    const edited = {
      ...seeded,
      theme: {
        ...seeded.theme,
        register_btn_text: { ...seeded.theme.register_btn_text, en: 'Save my seat' },
      },
    }
    const { node } = await retranslateDocument(edited, {
      source: 'en',
      targets: ['es'],
      locales: ['en', 'es'],
      translate: async (requests) =>
        Object.fromEntries(
          Object.entries(requests).map(([t, strings]) => [t, strings.map((s) => `${s} [${t}]`)])
        ),
    })
    // The seeded Spanish default gave way rather than being frozen forever.
    expect(node.theme.register_btn_text.es).toBe('Save my seat [es]')
    // Untouched fields kept their seeded wording — no needless churn.
    expect(node.hero.countdown_days_label.es).toBe('días')
  })
})
