import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'
import { QuestionInspector, VALIDATION_CONTROLS } from './QuestionInspector'

/**
 * The engine has always honoured min/max/length/pattern/accept/maxFileMb, but
 * the inspector only ever exposed `required`, so the rules could be set by
 * hand-editing JSONB alone. These render the real inspector to pin which
 * controls each type gets — the failure mode being a control for a rule
 * validate.js does not enforce, which would look set and silently do nothing.
 */
function render(question) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QuestionInspector
        question={{ id: 'q1', label: { en: 'Q' }, ...question }}
        allQuestions={[{ id: 'q1', label: { en: 'Q' }, ...question }]}
        participantTypes={[]}
        defaultLocale="en"
        supportedLocales={['en']}
        localeNames={{ en: 'English' }}
        editLocale="en"
        onChange={() => {}}
      />
    </NextIntlClientProvider>
  )
}

const labels = (html) => [...html.matchAll(/<label[^>]*>([^<]*)</g)].map((m) => m[1].trim())

describe('validation controls', () => {
  it('gives text length limits and an allowed-characters preset', () => {
    const html = render({ type: 'text' })
    expect(html).toContain('Validation')
    expect(labels(html)).toEqual(expect.arrayContaining(['Min length', 'Max length']))
    expect(html).toContain('Allowed characters')
    // Length rules, not numeric-range rules.
    expect(labels(html)).not.toContain('Min value')
  })

  it('gives number a value range and no length or pattern rules', () => {
    const html = render({ type: 'number' })
    expect(labels(html)).toEqual(expect.arrayContaining(['Min value', 'Max value']))
    expect(labels(html)).not.toContain('Min length')
    expect(html).not.toContain('Allowed characters')
  })

  it('gives textarea lengths but no pattern', () => {
    const html = render({ type: 'textarea' })
    expect(labels(html)).toEqual(expect.arrayContaining(['Min length', 'Max length']))
    expect(html).not.toContain('Allowed characters')
  })

  it('gives file an extension list and a size cap', () => {
    const html = render({ type: 'file' })
    expect(labels(html)).toEqual(
      expect.arrayContaining(['Accepted file types', 'Max file size (MB)'])
    )
  })

  it.each(['email', 'phone', 'date', 'select', 'checkbox', 'name', 'address', 'section'])(
    'renders no validation section for %s (the engine enforces nothing there)',
    (type) => {
      expect(render({ type, options: [] })).not.toContain('Validation')
    }
  )

  it('shows the stored pattern as its preset, and reveals the box only for custom', () => {
    const preset = render({ type: 'text', validation: { pattern: '^[0-9]+$' } })
    expect(preset).toContain('Digits only')
    expect(preset).not.toContain('Custom pattern (regular expression)')

    const custom = render({ type: 'text', validation: { pattern: '^[A-Z]{2}-\\d{4}$' } })
    expect(custom).toContain('Custom pattern (regular expression)')
  })

  it('warns when a range can never be satisfied', () => {
    expect(render({ type: 'number', validation: { min: 10, max: 2 } })).toContain(
      'no answer can pass'
    )
    expect(render({ type: 'number', validation: { min: 2, max: 10 } })).not.toContain(
      'no answer can pass'
    )
  })

  it('only offers rules the engine implements', () => {
    // Guards the table itself: adding a control here without a validate.js
    // branch is the bug this whole feature has to avoid.
    expect(Object.keys(VALIDATION_CONTROLS).sort()).toEqual([
      'file',
      'number',
      'text',
      'textarea',
    ])
  })
})
