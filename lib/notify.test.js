import { describe, expect, test } from 'vitest'
import { resolveRecipientLocale } from './notify'

/**
 * The language an attendee is written to must come from the attendee, not from
 * whichever organizer happened to click the button — the status route used to
 * pass its own UI locale, so a Ukrainian registrant got English mail.
 */
describe('resolveRecipientLocale', () => {
  test('prefers the language the registration was made in', () => {
    expect(
      resolveRecipientLocale({
        registrationLocale: 'uk',
        profileLocale: 'ru',
        eventDefaultLocale: 'en',
      })
    ).toBe('uk')
  })

  test('falls back to the profile preference, then the event default', () => {
    expect(
      resolveRecipientLocale({ registrationLocale: null, profileLocale: 'ru', eventDefaultLocale: 'en' })
    ).toBe('ru')
    expect(
      resolveRecipientLocale({ registrationLocale: null, profileLocale: null, eventDefaultLocale: 'fr' })
    ).toBe('fr')
  })

  test('falls back to English when nothing is known', () => {
    expect(resolveRecipientLocale({})).toBe('en')
    expect(resolveRecipientLocale()).toBe('en')
    expect(
      resolveRecipientLocale({ registrationLocale: '', profileLocale: '', eventDefaultLocale: '' })
    ).toBe('en')
  })
})
