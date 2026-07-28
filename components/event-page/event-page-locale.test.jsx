import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'
import { EventPageView } from './EventPageView'

// An event offered in English plus an organizer-added custom language ("pt").
// Custom languages are not platform routes, so the page renders on a real
// locale ("en") while the *content* resolves to the custom code.
function makeEvent() {
  return {
    id: 'e1',
    slug: 'demo',
    status: 'published',
    default_locale: 'en',
    starts_at: '2030-01-01T00:00:00Z',
    ends_at: '2030-01-02T00:00:00Z',
    name: { en: 'Demo Event', pt: 'Evento Demo' },
    description: { en: 'English description', pt: 'Descrição em português' },
    location: { en: 'Chiang Mai', pt: 'Chiang Mai' },
    contact: {},
    page_content: {
      i18n: { available: ['en', 'pt'], custom: [{ code: 'pt', name: 'Português' }] },
      about: { enabled: true, body: { en: 'About in English', pt: 'Sobre em português' } },
      // These five live in sections-extra.jsx — the ones that used to be wired
      // to the route locale instead of the content locale.
      tracks: {
        enabled: true,
        heading: { en: 'Tracks', pt: 'Trilhas' },
        items: [{ id: 't1', title: { en: 'Track one', pt: 'Trilha um' } }],
      },
      testimonials: {
        enabled: true,
        heading: { en: 'Testimonials', pt: 'Depoimentos' },
        items: [{ id: 's1', quote: { en: 'Great event', pt: 'Ótimo evento' }, author: 'Ana' }],
      },
      faq: {
        enabled: true,
        heading: { en: 'FAQ', pt: 'Perguntas' },
        items: [{ id: 'f1', question: { en: 'Cost?', pt: 'Custo?' }, answer: { en: 'Free', pt: 'Grátis' } }],
      },
      map: {
        enabled: true,
        heading: { en: 'Location', pt: 'Localização' },
        address: { en: 'Some street', pt: 'Alguma rua' },
      },
      gallery: {
        enabled: true,
        heading: { en: 'Moments', pt: 'Momentos' },
        items: [{ id: 'g1', image_path: 'events/e1/photo.jpg' }],
      },
    },
  }
}

function render(contentLocale) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <EventPageView
        event={makeEvent()}
        locale="en"
        contentLocale={contentLocale}
        registerHref="/en/events/demo/register"
      />
    </NextIntlClientProvider>
  )
}

describe('EventPageView content locale', () => {
  it('renders the default language when that is the content locale', () => {
    const html = render('en')
    expect(html).toContain('Demo Event')
    expect(html).toContain('Track one')
    expect(html).toContain('Great event')
  })

  // The reported bug: switching to a custom language translated the hero and
  // About, but Tracks / Testimonials / FAQ / Map / Gallery stayed in the
  // default language because they received the route locale, not the content
  // locale — so edits made in that language tab never showed on screen.
  it('resolves every section in a custom content locale, not just the built-in ones', () => {
    const html = render('pt')

    // Sections rendered directly by EventPageView (these already worked).
    expect(html).toContain('Evento Demo')
    expect(html).toContain('Sobre em português')

    // Sections rendered by sections-extra (these were the broken ones).
    expect(html).toContain('Trilhas')
    expect(html).toContain('Trilha um')
    expect(html).toContain('Depoimentos')
    expect(html).toContain('Ótimo evento')
    expect(html).toContain('Perguntas')
    expect(html).toContain('Custo?')
    expect(html).toContain('Localização')
    expect(html).toContain('Momentos')

    // And none of them fall back to English while another language is shown.
    expect(html).not.toContain('Track one')
    expect(html).not.toContain('Great event')
    expect(html).not.toContain('Cost?')
  })
})

describe('language switcher labels on the pages attendees see', () => {
  it('offers short codes, not full language names', () => {
    const html = render('en')
    // The switcher is the only place these appear, so matching on the option
    // text is enough to pin the label style.
    expect(html).toContain('>EN<')
    expect(html).toContain('>PT<')
    // The console keeps full names; the public hero must not spend the room.
    expect(html).not.toContain('>English<')
    expect(html).not.toContain('>Português<')
  })

  it('uppercases an organizer-added custom code too', () => {
    // Custom languages carry organizer-typed names ("Português") that would be
    // even longer than the built-ins — the code is what stays predictable.
    const html = render('pt')
    expect(html).toContain('>PT<')
    expect(html).not.toContain('>Português<')
  })
})

describe('language switcher colours', () => {
  function renderWithTheme(theme) {
    const event = makeEvent()
    event.page_content.theme = theme
    return renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <EventPageView
          event={event}
          locale="en"
          contentLocale="en"
          registerHref="/en/events/demo/register"
        />
      </NextIntlClientProvider>
    )
  }

  it('emits no switcher variables when the organizer has not picked colours', () => {
    // Absence is the feature: without these the CSS falls back to tinting from
    // the surrounding text, which is what keeps it legible over a cover photo.
    const html = renderWithTheme({})
    expect(html).not.toContain('--ep-lang-bg')
    expect(html).not.toContain('--ep-lang-text')
  })

  it('emits each variable only for the colour that was picked', () => {
    const html = renderWithTheme({ lang_text: '#ff0000' })
    expect(html).toContain('--ep-lang-text:#ff0000')
    expect(html).not.toContain('--ep-lang-bg')
  })

  it('emits both when both are picked', () => {
    const html = renderWithTheme({ lang_bg: '#0e5044', lang_text: '#ffffff' })
    expect(html).toContain('--ep-lang-bg:#0e5044')
    expect(html).toContain('--ep-lang-text:#ffffff')
  })
})
