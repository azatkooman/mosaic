'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { lt } from '@/lib/i18n/locales'
import { visibleQuestions } from '@/lib/form-engine/visibility'
import { validateParticipantAnswers } from '@/lib/form-engine/validate'
import { FormRenderer } from '@/components/form-runtime/FormRenderer'
import { Badge, Button, Field, Input } from '@/components/ui'
import styles from './participants.module.css'

/**
 * Slide-over panel showing one participant's full record. Read-only for
 * viewers; editable (name/email + every answer) for can_add_registrants
 * roles. Editing reuses the registration FormRenderer against the version
 * the participant answered, so validation and conditional logic match.
 */
export function ParticipantDetail({
  participant,
  typeName,
  definition,
  canEdit,
  onClose,
  onSaved,
}) {
  const t = useTranslations()
  const locale = useLocale()

  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(participant.first_name ?? '')
  const [lastName, setLastName] = useState(participant.last_name ?? '')
  const [email, setEmail] = useState(participant.email ?? '')
  const [answers, setAnswers] = useState(participant.answers ?? {})
  const [errors, setErrors] = useState({})
  const [saveState, setSaveState] = useState('idle') // idle | saving | error

  const typeKey = participant.participant_type_key

  function reset() {
    setFirstName(participant.first_name ?? '')
    setLastName(participant.last_name ?? '')
    setEmail(participant.email ?? '')
    setAnswers(participant.answers ?? {})
    setErrors({})
    setEditing(false)
  }

  async function save() {
    // Name/email are removable form questions, so blank names are legal here;
    // when the form does include a required name question, the shared answer
    // validation below still enforces it.
    const nextErrors = {}
    const res = validateParticipantAnswers(definition, typeKey, answers)
    Object.assign(nextErrors, res.errors)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setSaveState('saving')
    try {
      const r = await fetch(`/api/participants/${participant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, answers }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setSaveState('idle')
      setEditing(false)
      onSaved()
    } catch {
      setSaveState('error')
    }
  }

  // Read-only rendering of the answers the participant actually sees.
  const shownQuestions = visibleQuestions(definition, typeKey, participant.answers ?? {})

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-label={t('console.participantDetail')}>
        <header className={styles.drawerHead}>
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)' }}>
              {participant.first_name} {participant.last_name}
            </h2>
            <span className={styles.muted}>{lt(typeName, locale)}</span>{' '}
            <Badge tone={participant.status}>{t(`status.${participant.status}`)}</Badge>
          </div>
          <button className={styles.drawerClose} aria-label={t('common.close')} onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.drawerBody}>
          {editing ? (
            <>
              <div className={styles.editGrid}>
                <Field label={t('wizard.firstName')}>
                  {({ id }) => (
                    <Input id={id} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  )}
                </Field>
                <Field label={t('wizard.lastName')}>
                  {({ id }) => (
                    <Input id={id} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  )}
                </Field>
                <Field label={t('wizard.email')}>
                  {({ id }) => (
                    <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  )}
                </Field>
              </div>
              <FormRenderer
                definition={definition}
                participantTypeKey={typeKey}
                locale={locale}
                answers={answers}
                errors={errors}
                onChange={(qid, value) => setAnswers((a) => ({ ...a, [qid]: value }))}
              />
              {saveState === 'error' && <p className="alert alert-error">{t('console.saveFailed')}</p>}
            </>
          ) : (
            <dl className={styles.detailList}>
              <div>
                <dt>{t('wizard.email')}</dt>
                <dd>{participant.email || '—'}</dd>
              </div>
              {shownQuestions
                .filter((q) => q.type !== 'section')
                .map((q) => (
                  <div key={q.id}>
                    <dt>{lt(q.label, locale)}</dt>
                    <dd>{renderAnswer(participant.answers?.[q.id], q, locale, t)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>

        <footer className={styles.drawerFoot}>
          {editing ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={saveState === 'saving'}>
                {t('common.cancel')}
              </Button>
              <Button onClick={save} disabled={saveState === 'saving'}>
                {saveState === 'saving' ? t('wizard.submitting') : t('common.save')}
              </Button>
            </>
          ) : (
            <>
              <span style={{ flex: 1 }} />
              {canEdit && <Button onClick={() => setEditing(true)}>{t('common.edit')}</Button>}
            </>
          )}
        </footer>
      </aside>
    </>
  )
}

function renderAnswer(value, question, locale, t) {
  if (value == null || value === '') return '—'
  if (question.type === 'checkbox') return value ? t('status.confirmed') : '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return value
      .map((v) => lt(question.options?.find((o) => o.value === v)?.label, locale) || v)
      .join(', ')
  }
  if (['select', 'radio'].includes(question.type)) {
    return lt(question.options?.find((o) => o.value === value)?.label, locale) || String(value)
  }
  if (question.type === 'file') {
    return <span className={styles.muted}>📎 {String(value).split('/').pop()}</span>
  }
  return String(value)
}
