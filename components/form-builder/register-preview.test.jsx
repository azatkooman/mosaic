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

  // The band, and everything that has to hold whether or not it has a backdrop.
  // The GLOBAL class names are spelled out rather than read from the module on
  // purpose: the real register page is a server component with no CSS module,
  // so these names are the only thing making the band it draws and the band
  // drawn here the same band. A rename that reached one file has to fail here.
  const bandOf = (html) =>
    html.slice(html.indexOf('class="form-header"'), html.indexOf('</h1>'))

  it('renders a header background image when one is provided', () => {
    const html = render({ headerImageUrl: 'https://example.com/cover.jpg' })
    expect(html).toContain('src="https://example.com/cover.jpg"')
    expect(html).toContain('class="form-header-bg"')
    expect(html).toContain('class="form-header-scrim"')
    // data-backdrop is what turns on the padding, the radius and the crop, so
    // it is the difference between a band and a plain block.
    expect(html).toContain('data-backdrop="true"')
  })

  it('puts the title INSIDE the header band, so a backdrop covers it too', () => {
    const html = render({ headerImageUrl: 'https://example.com/cover.jpg' })
    const band = bandOf(html)
    expect(band).toContain('Register for Demo Event')
    expect(band).toContain('Back to event page')
    expect(band).toContain('lang-picker')
    // …and the form itself is emphatically not in there.
    expect(band).not.toContain('Your name')
  })

  it('renders the band with no backdrop when nothing is set, and no image', () => {
    const html = render()
    // Still a band — it holds the header zone either way — but a bare one, so
    // an untouched form renders the screen that existed before any of this.
    expect(html).toContain('class="form-header"')
    expect(html).not.toContain('data-backdrop')
    expect(html).not.toContain('form-header-bg')
    expect(html).not.toContain('form-header-scrim')
  })

  it('gives the back link and the language picker matching shells, always', () => {
    // Always, not only over an image: a ghost link vanishes on a page whose
    // background the organizer set to black, which is the case this variant was
    // widened to cover. Both controls, because they sit at opposite ends of one
    // row and a mismatch between them is the thing that reads as broken.
    for (const props of [{}, { headerImageUrl: 'https://example.com/cover.jpg' }]) {
      const band = bandOf(render(props))
      expect(band).toContain('btn-shell')
      expect(band).toContain("data-variant=\"shell\"")
      // The wizard's own Back button stays ghost, but it is below the band.
      expect(band).not.toContain('btn-ghost')
    }
  })

  it('leaves the background image decorative', () => {
    // Empty alt, deliberately: it is a backdrop behind controls that already
    // carry their own labels, so a screen reader announcing it would only add
    // noise between the heading and the first field.
    const html = render({ headerImageUrl: 'https://example.com/cover.jpg' })
    const tag = html.match(/<img[^>]*form-header-bg[^>]*>/)?.[0] ?? ''
    expect(tag).toContain('alt=""')
  })
})
