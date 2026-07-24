'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LOCALES, LOCALE_NAMES, lt } from '@/lib/i18n/locales'
import { ADDRESS_PART_KEYS, DEFAULT_ADDRESS_PARTS } from '@/lib/form-engine/address'
import {
  Field,
  Input,
  NativeSelect,
  Checkbox,
  Button,
} from '@/components/ui'
import styles from './builder.module.css'

const OPERATORS = ['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty', 'contains']
const NO_VALUE_OPERATORS = ['isEmpty', 'isNotEmpty']
// The rule engine requires an ARRAY value for these operators.
const ARRAY_OPERATORS = ['in', 'notIn']

export function QuestionInspector({
  question: q,
  allQuestions,
  participantTypes,
  defaultLocale,
  supportedLocales,
  localeNames,
  editLocale,
  onChange,
}) {
  const t = useTranslations('console')
  const tr = useTranslations('runtime')
  // Author only in the languages this event offers; fall back to the full
  // set if the caller didn't scope them.
  const locales = supportedLocales?.length ? supportedLocales : LOCALES
  // Display name for a language code — custom languages aren't in LOCALE_NAMES,
  // so fall back to the map passed from the event, then the raw code.
  const nameOf = (l) => localeNames?.[l] ?? LOCALE_NAMES[l] ?? l

  function setAddressPart(key, patch) {
    const current = q.addressParts ?? DEFAULT_ADDRESS_PARTS
    const prev = current[key] ?? DEFAULT_ADDRESS_PARTS[key]
    const next = { ...prev, ...patch }
    // A disabled part can't be required.
    if (!next.enabled) next.required = false
    onChange({ addressParts: { ...current, [key]: next } })
  }

  const myIndex = allQuestions.findIndex((x) => x.id === q.id)
  // Conditions may only reference earlier questions (backward references).
  const priorQuestions = allQuestions
    .slice(0, myIndex)
    .filter((x) => x.type !== 'section')

  const hasOptions = ['select', 'multiselect', 'radio'].includes(q.type)
  const rules = q.visibleIf?.rules ?? []

  function setLocalized(fieldName, value) {
    onChange({ [fieldName]: { ...(q[fieldName] ?? {}), [editLocale]: value } })
  }

  function setRule(index, patch) {
    const next = rules.map((r, i) => {
      if (i !== index) return r
      const merged = { ...r, ...patch }
      // Keep the value's shape in sync with the operator: in/notIn need
      // arrays, everything else needs a scalar.
      if (ARRAY_OPERATORS.includes(merged.operator) && !Array.isArray(merged.value)) {
        merged.value = merged.value === '' || merged.value == null ? [] : [merged.value]
      } else if (!ARRAY_OPERATORS.includes(merged.operator) && Array.isArray(merged.value)) {
        merged.value = merged.value[0] ?? ''
      }
      return merged
    })
    onChange({ visibleIf: { op: q.visibleIf?.op ?? 'and', rules: next } })
  }

  function addRule() {
    const first = priorQuestions[0]
    if (!first) return
    onChange({
      visibleIf: {
        op: q.visibleIf?.op ?? 'and',
        rules: [...rules, { questionId: first.id, operator: 'eq', value: '' }],
      },
    })
  }

  function removeRule(index) {
    const next = rules.filter((_, i) => i !== index)
    onChange({
      visibleIf: next.length ? { op: q.visibleIf?.op ?? 'and', rules: next } : undefined,
    })
  }

  return (
    <div className={styles.inspectorBody}>
      {/* Localized text */}
      <div className={styles.inspectorSection}>
        <Field label={`${t('questionLabel')} (${nameOf(editLocale)})`}>
          {({ id }) => (
            <Input
              id={id}
              value={q.label?.[editLocale] ?? ''}
              onChange={(e) => setLocalized('label', e.target.value)}
            />
          )}
        </Field>
        <Field label={`${t('helpText')} (${nameOf(editLocale)})`}>
          {({ id }) => (
            <Input
              id={id}
              value={q.help?.[editLocale] ?? ''}
              onChange={(e) => setLocalized('help', e.target.value)}
            />
          )}
        </Field>
      </div>

      {/* Required */}
      {q.type !== 'section' && (
        <label className={styles.requiredRow}>
          <Checkbox
            checked={!!q.required}
            onCheckedChange={(c) => onChange({ required: !!c })}
          />
          <span>{t('requiredField')}</span>
        </label>
      )}

      {/* Name format */}
      {q.type === 'name' && (
        <div className={styles.inspectorSection}>
          <Field label={t('nameFormat')}>
            {({ id }) => (
              <NativeSelect
                id={id}
                value={q.nameFormat ?? 'first_last'}
                onChange={(e) => onChange({ nameFormat: e.target.value })}
              >
                <option value="first_last">{t('nameFormatFirstLast')}</option>
                <option value="full">{t('nameFormatFull')}</option>
                <option value="first_middle_last">{t('nameFormatFirstMiddleLast')}</option>
              </NativeSelect>
            )}
          </Field>
        </div>
      )}

      {/* Address parts */}
      {q.type === 'address' && (
        <div className={styles.inspectorSection}>
          <span className="field-label">{t('addressParts')}</span>
          {ADDRESS_PART_KEYS.map((key) => {
            const part = (q.addressParts ?? DEFAULT_ADDRESS_PARTS)[key] ?? DEFAULT_ADDRESS_PARTS[key]
            return (
              <div key={key} className={styles.typeCheck} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1 }}>
                  <Checkbox
                    checked={!!part.enabled}
                    onCheckedChange={(c) => setAddressPart(key, { enabled: !!c })}
                  />
                  <span>{tr(`address_${key}`)}</span>
                </label>
                {part.enabled && (
                  <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
                    <Checkbox
                      checked={!!part.required}
                      onCheckedChange={(c) => setAddressPart(key, { required: !!c })}
                    />
                    <span>{t('requiredField')}</span>
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Participant types */}
      <div className={styles.inspectorSection}>
        <span className="field-label">{t('appliesTo')}</span>
        <label className={styles.typeCheck}>
          <Checkbox
            checked={!q.participantTypes?.length}
            onCheckedChange={(c) => c && onChange({ participantTypes: [] })}
          />
          <span>{t('allTypes')}</span>
        </label>
        {participantTypes.map((pt) => {
          const active = q.participantTypes?.includes(pt.key)
          return (
            <label key={pt.key} className={styles.typeCheck}>
              <Checkbox
                checked={!!active}
                onCheckedChange={(c) => {
                  const current = q.participantTypes ?? []
                  onChange({
                    participantTypes: c
                      ? [...current, pt.key]
                      : current.filter((k) => k !== pt.key),
                  })
                }}
              />
              <span>{lt(pt.name, editLocale, defaultLocale) || pt.key}</span>
            </label>
          )
        })}
      </div>

      {/* Options for choice questions */}
      {hasOptions && (
        <div className={styles.inspectorSection}>
          <span className="field-label">{t('options')}</span>
          {(q.options ?? []).map((o, i) => (
            <div key={i} className={styles.optionRow}>
              <Input
                aria-label={`${t('options')} ${i + 1}`}
                value={o.label?.[editLocale] ?? ''}
                placeholder={o.value}
                onChange={(e) => {
                  const options = q.options.map((opt, j) =>
                    j === i
                      ? { ...opt, label: { ...opt.label, [editLocale]: e.target.value } }
                      : opt
                  )
                  onChange({ options })
                }}
              />
              <button
                className={styles.removeBtn}
                aria-label={t('remove')}
                onClick={() => onChange({ options: q.options.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                options: [
                  ...(q.options ?? []),
                  { value: `opt_${(q.options?.length ?? 0) + 1}_${Date.now().toString(36)}`, label: {} },
                ],
              })
            }
          >
            {t('addOption')}
          </Button>
        </div>
      )}

      {/* Conditional visibility */}
      {q.type !== 'section' && priorQuestions.length > 0 && (
        <div className={styles.inspectorSection}>
          <span className="field-label">{t('conditions')}</span>
          {rules.length > 0 && (
            <NativeSelect
              aria-label={t('showWhen')}
              value={q.visibleIf?.op ?? 'and'}
              onChange={(e) =>
                onChange({ visibleIf: { op: e.target.value, rules } })
              }
            >
              <option value="and">{t('allOf')}</option>
              <option value="or">{t('anyOf')}</option>
            </NativeSelect>
          )}
          {rules.map((rule, i) => {
            const refQ = priorQuestions.find((x) => x.id === rule.questionId)
            const refHasOptions = ['select', 'multiselect', 'radio'].includes(refQ?.type)
            return (
              <div key={i} className={styles.ruleRow}>
                <NativeSelect
                  aria-label="Question"
                  value={rule.questionId}
                  onChange={(e) => setRule(i, { questionId: e.target.value, value: '' })}
                >
                  {priorQuestions.map((pq) => (
                    <option key={pq.id} value={pq.id}>
                      {lt(pq.label, editLocale, defaultLocale) || pq.id}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Operator"
                  value={rule.operator}
                  onChange={(e) => setRule(i, { operator: e.target.value })}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </NativeSelect>
                {!NO_VALUE_OPERATORS.includes(rule.operator) &&
                  (ARRAY_OPERATORS.includes(rule.operator) ? (
                    refHasOptions ? (
                      <NativeSelect
                        aria-label="Value"
                        multiple
                        size={Math.min(4, (refQ.options ?? []).length || 1)}
                        value={Array.isArray(rule.value) ? rule.value : []}
                        onChange={(e) =>
                          setRule(i, {
                            value: [...e.target.selectedOptions].map((o) => o.value),
                          })
                        }
                      >
                        {(refQ.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {lt(o.label, editLocale, defaultLocale) || o.value}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      // Free-text lists: comma-separated, stored as an array.
                      <Input
                        aria-label="Value"
                        value={Array.isArray(rule.value) ? rule.value.join(', ') : ''}
                        onChange={(e) =>
                          setRule(i, {
                            value: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    )
                  ) : refHasOptions ? (
                    <NativeSelect
                      aria-label="Value"
                      value={rule.value ?? ''}
                      onChange={(e) => setRule(i, { value: e.target.value })}
                    >
                      <option value="" />
                      {(refQ.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {lt(o.label, editLocale, defaultLocale) || o.value}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      aria-label="Value"
                      value={rule.value ?? ''}
                      onChange={(e) => setRule(i, { value: e.target.value })}
                    />
                  ))}
                <button
                  className={styles.removeBtn}
                  aria-label={t('remove')}
                  onClick={() => removeRule(i)}
                >
                  ×
                </button>
              </div>
            )
          })}
          <Button variant="secondary" size="sm" onClick={addRule}>
            {t('addCondition')}
          </Button>
        </div>
      )}
    </div>
  )
}
