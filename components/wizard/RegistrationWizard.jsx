'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { lt } from '@/lib/i18n/locales'
import { validateParticipantAnswers } from '@/lib/form-engine/validate'
import { extractIdentity } from '@/lib/form-engine/identity'
import { FormRenderer } from '@/components/form-runtime/FormRenderer'
import { Button, Badge, RadioGroup, RadioRow } from '@/components/ui'
import styles from './wizard.module.css'

/**
 * Group registration wizard.
 * Steps: mode (single/family) → single-type or counts → one pass per
 * participant → review → done. Draft state persists to localStorage per
 * event so long family registrations survive a reload.
 *
 * Props: event row, participantTypes (with joined form + current version
 * definition — null when the type relies on a mode form), modeForms
 * ({ single?, family? } definitions that override per-type forms), userId.
 */
export function RegistrationWizard({ event, participantTypes, modeForms = {}, userId }) {
  const t = useTranslations('wizard')
  const tCommon = useTranslations('common')
  const tMyRegs = useTranslations('myRegs')
  const locale = useLocale()
  const storageKey = `mosaic-draft-${event.slug}`

  const [step, setStep] = useState('mode') // mode | single-type | counts | person | review | done
  const [mode, setMode] = useState(null) // 'single' | 'family'
  const [singleTypeKey, setSingleTypeKey] = useState(null)
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

  // The form a person fills: the mode-specific form when the organizer made
  // one, otherwise the participant type's own assigned form.
  function definitionFor(pt, forMode = mode) {
    return (forMode ? modeForms?.[forMode] : null) ?? pt.definition ?? { questions: [] }
  }

  // Types that can actually be registered under a mode: a mode form covers
  // every type; without one a type needs its own published form.
  function typesFor(forMode) {
    return modeForms?.[forMode]
      ? participantTypes
      : participantTypes.filter((pt) => pt.definition)
  }

  // Restore draft once on mount — but only when it still matches the event's
  // CURRENT participant types. A draft saved before an organizer removed a
  // type (or unpublished its form) would otherwise crash every render.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const draft = JSON.parse(raw)
      const validTypes = new Set(participantTypes.map((pt) => pt.key))
      const usable =
        draft.people?.length > 0 &&
        draft.people.every((p) => p && validTypes.has(p.participantTypeKey)) &&
        Object.keys(draft.counts ?? {}).every((k) => validTypes.has(k))
      if (!usable) {
        localStorage.removeItem(storageKey)
        return
      }
      setCounts(draft.counts ?? {})
      setPeople(draft.people)
      setMode(draft.mode === 'single' || draft.mode === 'family' ? draft.mode : null)
      setSingleTypeKey(validTypes.has(draft.singleTypeKey) ? draft.singleTypeKey : null)
      setStep(draft.step ?? 'counts')
      setPersonIndex(Math.min(draft.personIndex ?? 0, draft.people.length - 1))
      setRestored(true)
    } catch {
      // corrupted draft — start fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        JSON.stringify({ counts, people, step, personIndex, mode, singleTypeKey })
      )
    }
  }, [counts, people, step, personIndex, mode, singleTypeKey, storageKey])

  function chooseMode() {
    if (!mode) {
      setErrors({ _mode: t('noModeSelected') })
      return
    }
    setErrors({})
    setStep(mode === 'single' ? 'single-type' : 'counts')
  }

  function startSingle() {
    if (!singleTypeKey || !typeByKey.has(singleTypeKey)) {
      setErrors({ _singleType: t('noTypesSelected') })
      return
    }
    // Keep an already-entered person of the same type on back-and-forth.
    setPeople((prev) => {
      const existing = prev.find((p) => p.participantTypeKey === singleTypeKey)
      return [existing ?? { participantTypeKey: singleTypeKey, answers: {} }]
    })
    setErrors({})
    setPersonIndex(0)
    setStep('person')
  }

  function startForms() {
    const familyTypes = typesFor('family')
    const total = familyTypes.reduce((sum, pt) => sum + (counts[pt.key] ?? 0), 0)
    if (total === 0) {
      setErrors({ _counts: t('noTypesSelected') })
      return
    }
    // Preserve already-entered people PER TYPE: changing the count of one
    // type must never discard or shuffle another type's entries (positional
    // matching lost data when an earlier type's count changed).
    setPeople((prev) => {
      const byType = new Map()
      for (const person of prev) {
        const bucket = byType.get(person.participantTypeKey) ?? []
        bucket.push(person)
        byType.set(person.participantTypeKey, bucket)
      }
      const list = []
      for (const pt of familyTypes) {
        const existing = byType.get(pt.key) ?? []
        const n = counts[pt.key] ?? 0
        for (let i = 0; i < n; i++) {
          list.push(existing[i] ?? { participantTypeKey: pt.key, answers: {} })
        }
      }
      return list
    })
    setErrors({})
    setPersonIndex(0)
    setStep('person')
  }

  // Answer updates must merge against the LATEST state: async callbacks
  // (file uploads finishing) would otherwise overwrite answers typed while
  // they were in flight with a stale snapshot.
  function setAnswer(index, questionId, value) {
    setPeople((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, answers: { ...p.answers, [questionId]: value } } : p
      )
    )
  }

  function validatePerson(index) {
    const p = people[index]
    const pt = typeByKey.get(p.participantTypeKey)
    const res = validateParticipantAnswers(definitionFor(pt), pt.key, p.answers)
    setErrors(res.errors)
    return Object.keys(res.errors).length === 0
  }

  // Name/email are ordinary questions now; a person's display name comes
  // from their answers (blank when the organizer removed the name question).
  function displayName(p) {
    const pt = typeByKey.get(p.participantTypeKey)
    const { firstName, lastName } = extractIdentity(definitionFor(pt), pt.key, p.answers)
    return `${firstName} ${lastName}`.trim()
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
      setStep(mode === 'single' ? 'single-type' : 'counts')
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
          registrationMode: mode,
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

  if (step === 'done' && result) {
    return (
      <div className={styles.panel}>
        <h2 className="page-title">{t('successTitle')}</h2>
        <p className={styles.muted}>{t('successBody')}</p>
        <ul className={styles.resultList}>
          {result.participants.map((p, i) => (
            <li key={p.participant_id}>
              <span>
                {p.first_name || t('participantOf', { index: i + 1, total: result.participants.length })}
              </span>
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

  if (step === 'mode') {
    const singleAvailable = typesFor('single').length > 0
    const familyAvailable = typesFor('family').length > 0
    return (
      <div className={styles.panel}>
        <h2>{t('modeTitle')}</h2>
        <p className={styles.muted}>{t('modeHelp')}</p>
        {restored && <p className="alert alert-info">{t('draftRestored')}</p>}
        <RadioGroup
          value={mode ?? ''}
          onValueChange={(v) => {
            setMode(v)
            setErrors({})
          }}
          aria-label={t('modeTitle')}
        >
          {singleAvailable && (
            <RadioRow
              id="reg-mode-single"
              value="single"
              checked={mode === 'single'}
              label={
                <span>
                  <strong>{t('modeSingle')}</strong>
                  <span className={styles.muted} style={{ display: 'block' }}>
                    {t('modeSingleHelp')}
                  </span>
                </span>
              }
            />
          )}
          {familyAvailable && (
            <RadioRow
              id="reg-mode-family"
              value="family"
              checked={mode === 'family'}
              label={
                <span>
                  <strong>{t('modeFamily')}</strong>
                  <span className={styles.muted} style={{ display: 'block' }}>
                    {t('modeFamilyHelp')}
                  </span>
                </span>
              }
            />
          )}
        </RadioGroup>
        {errors._mode && <p className="alert alert-error">{errors._mode}</p>}
        <div className={styles.nav}>
          <span />
          <Button onClick={chooseMode}>{tCommon('next')}</Button>
        </div>
      </div>
    )
  }

  if (step === 'single-type') {
    return (
      <div className={styles.panel}>
        <h2>{t('singleTypeTitle')}</h2>
        <p className={styles.muted}>{t('singleTypeHelp')}</p>
        <RadioGroup
          value={singleTypeKey ?? ''}
          onValueChange={(v) => {
            setSingleTypeKey(v)
            setErrors({})
          }}
          aria-label={t('singleTypeTitle')}
        >
          {typesFor('single').map((pt) => (
            <RadioRow
              key={pt.key}
              id={`single-type-${pt.key}`}
              value={pt.key}
              checked={singleTypeKey === pt.key}
              label={lt(pt.name, locale, event.default_locale)}
            />
          ))}
        </RadioGroup>
        {errors._singleType && <p className="alert alert-error">{errors._singleType}</p>}
        <div className={styles.nav}>
          <Button variant="ghost" onClick={() => { setErrors({}); setStep('mode') }}>
            {tCommon('back')}
          </Button>
          <Button onClick={startSingle}>{tCommon('next')}</Button>
        </div>
      </div>
    )
  }

  if (step === 'counts') {
    return (
      <div className={styles.panel}>
        <h2>{t('whoIsComing')}</h2>
        <p className={styles.muted}>{t('typeCountHelp')}</p>
        <div className={styles.countGrid}>
          {typesFor('family').map((pt) => (
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
          <Button variant="ghost" onClick={() => { setErrors({}); setStep('mode') }}>
            {tCommon('back')}
          </Button>
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
        <p className="eyebrow">
          {t('participantOf', { index: personIndex + 1, total: people.length })} ·{' '}
          {lt(pt.name, locale, event.default_locale)}
        </p>
        <FormRenderer
          definition={definitionFor(pt)}
          participantTypeKey={pt.key}
          locale={locale}
          defaultLocale={event.default_locale}
          answers={p.answers}
          errors={errors}
          onChange={(qid, value) => setAnswer(personIndex, qid, value)}
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
      <h2>{t('review')}</h2>
      <p className={styles.muted}>{t('reviewHelp')}</p>
      <ul className={styles.reviewList}>
        {people.map((p, i) => {
          const pt = typeByKey.get(p.participantTypeKey)
          return (
            <li key={i} className="card card-pad">
              <div className={styles.reviewHead}>
                <strong>
                  {displayName(p) ||
                    t('participantOf', { index: i + 1, total: people.length })}
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
