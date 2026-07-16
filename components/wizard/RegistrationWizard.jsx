'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { lt } from '@/lib/i18n/locales'
import { validateParticipantAnswers } from '@/lib/form-engine/validate'
import { FormRenderer } from '@/components/form-runtime/FormRenderer'
import { Button, Field, Input, Badge } from '@/components/ui'
import styles from './wizard.module.css'

/**
 * Group registration wizard.
 * Steps: counts → one pass per participant → review → done.
 * Draft state persists to localStorage per event so long family
 * registrations survive a reload.
 *
 * Props: event row, participantTypes (with joined form + current version
 * definition), userId.
 */
export function RegistrationWizard({ event, participantTypes, userId }) {
  const t = useTranslations('wizard')
  const tCommon = useTranslations('common')
  const tv = useTranslations('validation')
  const tMyRegs = useTranslations('myRegs')
  const locale = useLocale()
  const storageKey = `mosaic-draft-${event.slug}`

  const [step, setStep] = useState('counts') // counts | person-N | review | done
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(participantTypes.map((pt) => [pt.key, 0]))
  )
  const [people, setPeople] = useState([])
  const [personIndex, setPersonIndex] = useState(0)
  const [errors, setErrors] = useState({})
  const [submitState, setSubmitState] = useState('idle') // idle | submitting | error
  const [result, setResult] = useState(null)
  const [restored, setRestored] = useState(false)

  const typeByKey = useMemo(
    () => new Map(participantTypes.map((pt) => [pt.key, pt])),
    [participantTypes]
  )

  // Restore draft once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.people?.length) {
          setCounts(draft.counts ?? {})
          setPeople(draft.people)
          setStep(draft.step ?? 'counts')
          setPersonIndex(draft.personIndex ?? 0)
          setRestored(true)
        }
      }
    } catch {
      // corrupted draft — start fresh
    }
  }, [storageKey])

  // Persist draft on every change (until submitted).
  useEffect(() => {
    if (step === 'done') {
      localStorage.removeItem(storageKey)
      return
    }
    if (people.length > 0) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ counts, people, step, personIndex })
      )
    }
  }, [counts, people, step, personIndex, storageKey])

  function startForms() {
    const list = []
    for (const pt of participantTypes) {
      const n = counts[pt.key] ?? 0
      for (let i = 0; i < n; i++) {
        list.push({
          participantTypeKey: pt.key,
          firstName: '',
          lastName: '',
          email: '',
          answers: {},
        })
      }
    }
    if (list.length === 0) {
      setErrors({ _counts: t('noTypesSelected') })
      return
    }
    // Keep already-entered people when counts didn't change.
    setPeople((prev) =>
      list.map((slot, i) =>
        prev[i]?.participantTypeKey === slot.participantTypeKey ? prev[i] : slot
      )
    )
    setErrors({})
    setPersonIndex(0)
    setStep('person')
  }

  function updatePerson(index, patch) {
    setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function validatePerson(index) {
    const p = people[index]
    const pt = typeByKey.get(p.participantTypeKey)
    const res = validateParticipantAnswers(pt.definition, pt.key, p.answers)
    const personErrors = { ...res.errors }
    if (!p.firstName.trim()) personErrors._firstName = 'required'
    if (!p.lastName.trim()) personErrors._lastName = 'required'
    setErrors(personErrors)
    return Object.keys(personErrors).length === 0
  }

  function nextPerson() {
    if (!validatePerson(personIndex)) return
    setErrors({})
    if (personIndex + 1 < people.length) {
      setPersonIndex(personIndex + 1)
    } else {
      setStep('review')
    }
  }

  function prevStep() {
    setErrors({})
    if (step === 'review') {
      setPersonIndex(people.length - 1)
      setStep('person')
    } else if (personIndex > 0) {
      setPersonIndex(personIndex - 1)
    } else {
      setStep('counts')
    }
  }

  async function submit() {
    setSubmitState('submitting')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          locale,
          participants: people,
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setResult(data)
      setStep('done')
      setSubmitState('idle')
    } catch {
      setSubmitState('error')
    }
  }

  // ---- render ----

  const STEP_ORDER = { counts: 1, person: 2, review: 3 }
  const stepLabels = [t('stepWho'), t('stepDetails'), t('stepReview')]

  function Progress() {
    const current = STEP_ORDER[step]
    return (
      <ol className={styles.progress} aria-label={t('stepOf', { current, total: 3 })}>
        {stepLabels.map((label, i) => {
          const n = i + 1
          const state = n < current ? 'done' : n === current ? 'current' : 'todo'
          return (
            <li
              key={label}
              className={styles.progressStep}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={styles.progressDot}>{state === 'done' ? '✓' : n}</span>
              <span className={styles.progressLabel}>{label}</span>
            </li>
          )
        })}
      </ol>
    )
  }

  if (step === 'done' && result) {
    return (
      <div className={styles.panel}>
        <h2 className="page-title">{t('successTitle')}</h2>
        <p className={styles.muted}>{t('successBody')}</p>
        <ul className={styles.resultList}>
          {result.participants.map((p) => (
            <li key={p.participant_id}>
              <span>{p.first_name}</span>
              <Badge tone={p.status}>
                {p.status === 'confirmed' ? t('statusConfirmed') : t('statusWaitlisted')}
              </Badge>
            </li>
          ))}
        </ul>
        <Link href="/my/registrations" className="btn btn-primary">
          {tMyRegs('title')}
        </Link>
      </div>
    )
  }

  if (step === 'counts') {
    return (
      <div className={styles.panel}>
        <Progress />
        <h2>{t('whoIsComing')}</h2>
        <p className={styles.muted}>{t('typeCountHelp')}</p>
        {restored && <p className="alert alert-info">{t('draftRestored')}</p>}
        <div className={styles.countGrid}>
          {participantTypes.map((pt) => (
            <div key={pt.key} className={styles.countRow}>
              <span className={styles.countLabel}>
                {lt(pt.name, locale, event.default_locale)}
              </span>
              <CountStepper
                value={counts[pt.key] ?? 0}
                min={0}
                max={pt.max_per_registration}
                onChange={(v) => setCounts((c) => ({ ...c, [pt.key]: v }))}
              />
            </div>
          ))}
        </div>
        {errors._counts && <p className="alert alert-error">{errors._counts}</p>}
        <div className={styles.nav}>
          <span />
          <Button onClick={startForms}>{tCommon('next')}</Button>
        </div>
      </div>
    )
  }

  if (step === 'person') {
    const p = people[personIndex]
    const pt = typeByKey.get(p.participantTypeKey)
    return (
      <div className={styles.panel}>
        <Progress />
        <p className="eyebrow">
          {t('participantOf', { index: personIndex + 1, total: people.length })} ·{' '}
          {lt(pt.name, locale, event.default_locale)}
        </p>
        <p className={styles.muted}>{t('personHelp')}</p>
        <div className={styles.nameGrid}>
          <Field label={t('firstName')} required error={errors._firstName ? tv('required') : undefined}>
            {({ id, invalid }) => (
              <Input
                id={id}
                value={p.firstName}
                aria-invalid={invalid}
                autoComplete="off"
                onChange={(e) => updatePerson(personIndex, { firstName: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('lastName')} required error={errors._lastName ? tv('required') : undefined}>
            {({ id, invalid }) => (
              <Input
                id={id}
                value={p.lastName}
                aria-invalid={invalid}
                autoComplete="off"
                onChange={(e) => updatePerson(personIndex, { lastName: e.target.value })}
              />
            )}
          </Field>
          <Field label={`${t('email')} (${tCommon('optional')})`}>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={p.email}
                autoComplete="off"
                onChange={(e) => updatePerson(personIndex, { email: e.target.value })}
              />
            )}
          </Field>
        </div>
        <FormRenderer
          definition={pt.definition}
          participantTypeKey={pt.key}
          locale={locale}
          defaultLocale={event.default_locale}
          answers={p.answers}
          errors={errors}
          onChange={(qid, value) =>
            updatePerson(personIndex, { answers: { ...p.answers, [qid]: value } })
          }
          uploadContext={{ eventId: event.id, userId }}
        />
        <div className={styles.nav}>
          <Button variant="ghost" onClick={prevStep}>
            {tCommon('back')}
          </Button>
          <Button onClick={nextPerson}>{tCommon('next')}</Button>
        </div>
      </div>
    )
  }

  // review
  return (
    <div className={styles.panel}>
      <Progress />
      <h2>{t('review')}</h2>
      <p className={styles.muted}>{t('reviewHelp')}</p>
      <ul className={styles.reviewList}>
        {people.map((p, i) => {
          const pt = typeByKey.get(p.participantTypeKey)
          return (
            <li key={i} className="card card-pad">
              <div className={styles.reviewHead}>
                <strong>
                  {p.firstName} {p.lastName}
                </strong>
                <span className={styles.muted}>
                  {lt(pt.name, locale, event.default_locale)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPersonIndex(i)
                  setStep('person')
                }}
              >
                {tCommon('edit')}
              </Button>
            </li>
          )
        })}
      </ul>
      {submitState === 'error' && <p className="alert alert-error">{t('submitError')}</p>}
      <div className={styles.nav}>
        <Button variant="ghost" onClick={prevStep}>
          {tCommon('back')}
        </Button>
        <Button onClick={submit} disabled={submitState === 'submitting'}>
          {submitState === 'submitting' ? t('submitting') : t('submitRegistration')}
        </Button>
      </div>
    </div>
  )
}

function CountStepper({ value, min, max, onChange }) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label="−"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className={styles.stepperValue} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label="+"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}
