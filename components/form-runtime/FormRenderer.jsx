'use client'

import { useTranslations } from 'next-intl'
import { visibleQuestions } from '@/lib/form-engine/visibility'
import { lt } from '@/lib/i18n/locales'
import { QuestionField } from './QuestionField'
import styles from './form-runtime.module.css'

/**
 * Renders a form definition for one participant.
 * Controlled: `answers` map in, `onChange(questionId, value)` out.
 * Visibility re-evaluates on every answer change; errors come from
 * validateParticipantAnswers (same module the server runs).
 */
export function FormRenderer({
  definition,
  participantTypeKey,
  locale,
  defaultLocale = 'en',
  answers,
  errors = {},
  onChange,
  preview = false,
  uploadContext,
  // 'registrant' by default, so the builder preview and the wizard both show
  // exactly what an attendee sees; only the organizer drawer opts into 'admin'.
  audience = 'registrant',
}) {
  const t = useTranslations('validation')
  const questions = visibleQuestions(definition, participantTypeKey, answers, { audience })

  return (
    <div className={styles.form}>
      {questions.map((q) =>
        q.type === 'section' ? (
          <div key={q.id} className={styles.section}>
            <h3>{lt(q.label, locale, defaultLocale)}</h3>
            {q.help && <p>{lt(q.help, locale, defaultLocale)}</p>}
          </div>
        ) : (
          <QuestionField
            key={q.id}
            question={q}
            locale={locale}
            defaultLocale={defaultLocale}
            value={answers[q.id]}
            error={errors[q.id] ? t(errors[q.id]) : undefined}
            onChange={(value) => onChange(q.id, value)}
            preview={preview}
            uploadContext={uploadContext}
          />
        )
      )}
    </div>
  )
}
