import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'
import { RegisterPreview } from './RegisterPreview'

/**
 * The "Forms page" tab restates the register page's layout rather than mounting
 * the wizard, so nothing but a test holds the two together: the register page
 * can gain a control and this replica keep rendering the old screen, silently
 * and while looking entirely correct. These pin the chrome that makes it a
 * replica at all, and the two properties that are easy to lose by accident —
 * that the chrome renders in the PREVIEWED language rather than the console's,
 * and that none of it navigates.
 */
const DEFINITION = {
  questions: [
    { id: 'q1', type: 'text', label: { en: 'Your name', ru: 'Ваше имя' }, participantTypes: ['staff'] },
  ],
}

const TYPES = [{ key: 'staff', name: { en: 'Staff', ru: 'Персонал' } }]

function render(props = {}) {
  return renderToStaticMarkup(
    // The console's own locale is English throughout; `locale` is what the
    // organizer is previewing.
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RegisterPreview
        definition={DEFINITION}
        eventName={{ en: 'Demo Event', ru: 'Демо' }}
        participantTypes={TYPES}
        participantTypeKey="staff"
        locale="en"
        defaultLocale="en"
        supportedLocales={['en', 'ru']}
        localeNames={{ en: 'English', ru: 'Русский' }}
        answers={{}}
        onAnswerChange={() => {}}
        {...props}
      />
    </NextIntlClientProvider>
  )
}

describe('RegisterPreview — the Forms page tab', () => {
  it('renders the register screen chrome around the form', () => {
    const html = render()
    expect(html).toContain('Register for Demo Event')
    expect(html).toContain('Participant 1 of 1')
    expect(html).toContain('Back to event page')
    expect(html).toContain('>Next<')
    expect(html).toContain('>Back<')
    // The participant type rides the eyebrow beside the participant count,
    // exactly as the wizard's person step writes it.
    expect(html).toContain('Staff')
    // …and the form itself is the thing being previewed.
    expect(html).toContain('Your name')
  })

  it('renders the chrome in the previewed language, not the console’s', () => {
    const html = render({ locale: 'ru' })
    expect(html).toContain('Регистрация на Демо')
    expect(html).toContain('Участник 1 из 1')
    expect(html).toContain('Назад к странице события')
    expect(html).toContain('Ваше имя')
    expect(html).not.toContain('Participant 1 of 1')
  })

  it('falls back to the event language for a custom language, which has no catalog', () => {
    // A custom code ("pt") is not a platform locale, so there are no platform
    // strings for it. Content still resolves through `lt`, which falls back to
    // the event's default language.
    const html = render({ locale: 'pt', supportedLocales: ['en', 'pt'] })
    expect(html).toContain('Participant 1 of 1')
  })

  it('navigates nowhere: every chrome control is inert', () => {
    const html = render()
    // The register page renders the back link as <a href>. Here it must not be
    // a link at all — an anchor would leave the console.
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
  })

  it('shows the language picker with short codes, and only when there are two', () => {
    expect(render()).toContain('>EN<')
    // LanguagePicker renders nothing below two options — same as the register
    // page for a single-language event.
    expect(render({ supportedLocales: ['en'] })).not.toContain('lang-picker')
  })
})
