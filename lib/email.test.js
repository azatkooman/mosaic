import { describe, expect, test } from 'vitest'
import { emailTranslator } from './email'

// The email templates are the only strings rendered outside a next-intl
// provider, so a missing key or malformed ICU message would only surface when
// a real email goes out. Exercise every locale here instead.
const LOCALES = ['en', 'es', 'fr', 'ru', 'uk']

describe('emailTranslator', () => {
  test.each(LOCALES)('%s renders every email string', (locale) => {
    const t = emailTranslator(locale)
    for (const key of [
      'confirmIntro', 'participant', 'statusColumn', 'viewRegistrations',
      'waitlistPromoted', 'viewRegistration', 'roleSignIn', 'roleConsole',
      'roleQuestions', 'roleAdmin', 'roleOrganizer', 'automated',
    ]) {
      expect(t(key)).toBeTruthy()
    }
    for (const key of ['confirmSubject', 'confirmHeading', 'statusSubjectConfirmed', 'statusSubjectUpdated', 'statusHeading']) {
      expect(t(key, { eventName: 'Summer Camp' })).toContain('Summer Camp')
    }
    expect(t('hello', { name: 'Ada' })).toContain('Ada')
    expect(t('statusLine', { eventName: 'Summer Camp', status: 'X' })).toContain('X')
    for (const key of ['roleInviteSubject', 'roleGrantedSubject', 'roleInviteBody', 'roleGrantedBody']) {
      expect(t(key, { roleName: 'Admin' })).toContain('Admin')
    }
  })

  test('unknown locale falls back to English', () => {
    expect(emailTranslator('th')('roleAdmin')).toBe('Admin')
  })
})
