import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'
import { QuestionInspector } from './QuestionInspector'

/**
 * The operator dropdown used to render the engine's own keys ("neq", "notIn").
 * These render the real inspector so the `operators` namespace wiring is
 * exercised, not just the label table.
 */
function render(watched, locale = 'en') {
  const prior = { id: 'q1', type: watched, label: { en: 'Watched' }, options: [] }
  const target = {
    id: 'q2',
    type: 'text',
    label: { en: 'Target' },
    visibleIf: { op: 'and', rules: [{ questionId: 'q1', operator: 'isNotEmpty' }] },
  }
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <QuestionInspector
        question={target}
        allQuestions={[prior, target]}
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

/** The <option> texts of the operator <select> (the second select in a rule row). */
function operatorOptions(html) {
  const select = html.match(/<select[^>]*aria-label="Operator"[^>]*>([\s\S]*?)<\/select>/)
  if (!select) return null
  return [...select[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1])
}

describe('QuestionInspector operator dropdown', () => {
  it('shows plain language, never the raw engine keys', () => {
    const opts = operatorOptions(render('text'))
    expect(opts).toEqual([
      'is',
      'is not',
      'contains',
      'is any of',
      'is none of',
      'has no answer',
      'has any answer',
    ])
  })

  it('words the comparison for a date', () => {
    const opts = operatorOptions(render('date'))
    expect(opts).toContain('is after')
    expect(opts).toContain('is on or before')
    expect(opts).not.toContain('is greater than')
  })

  it('offers a checkbox as checked / unchecked', () => {
    expect(operatorOptions(render('checkbox'))).toEqual(['is checked', 'is unchecked'])
  })

  it('drops the operators that can never match a multiselect', () => {
    const opts = operatorOptions(render('multiselect'))
    expect(opts).toEqual(['includes', 'has no answer', 'has any answer'])
  })

  it('reduces a composite answer to a presence test', () => {
    expect(operatorOptions(render('name'))).toEqual(['has no answer', 'has any answer'])
    expect(operatorOptions(render('address'))).toEqual(['has no answer', 'has any answer'])
  })

  it('translates the labels', () => {
    const opts = operatorOptions(render('text', 'en'))
    expect(opts).not.toContain('neq')
    // A key that leaked through would render as the bare key or an error.
    for (const o of opts) expect(o).not.toMatch(/^(operators\.|neq|notIn|isNotEmpty)$/)
  })
})
