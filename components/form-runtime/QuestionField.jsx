'use client'

import { useId, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { lt } from '@/lib/i18n/locales'
import { addressParts } from '@/lib/form-engine/address'
import { DIAL_CODES } from '@/lib/dial-codes'
import {
  Field,
  Input,
  Textarea,
  NativeSelect,
  CheckboxRow,
  RadioGroup,
  RadioRow,
} from '@/components/ui'
import { FileUploadField } from './FileUploadField'

const subLabelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--ink-soft)',
  display: 'block',
  marginBottom: '0.25rem',
}
const subGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--s-3, 0.75rem)',
}

/** Renders one question of any type. Value semantics per type:
 *  text/textarea/email/date: string · number: string|number ·
 *  select/radio: option value · multiselect: string[] · checkbox: boolean ·
 *  file: storage object path string · name: {first, middle, last, full} ·
 *  address: {line1, line2, city, state, postalCode, country} ·
 *  phone: {iso, code, number} (legacy answers may be plain strings)
 */
export function QuestionField({
  question: q,
  locale,
  defaultLocale,
  value,
  error,
  onChange,
  preview = false,
  uploadContext,
}) {
  const groupId = useId()
  const tr = useTranslations('runtime')
  const label = lt(q.label, locale, defaultLocale)
  const help = q.help ? lt(q.help, locale, defaultLocale) : undefined

  const common = { label, required: q.required, help, error }

  // Country names for the phone dial-code picker, in the UI language.
  const dialOptions = useMemo(() => {
    if (q.type !== 'phone') return []
    let names
    try {
      names = new Intl.DisplayNames([locale], { type: 'region' })
    } catch {
      names = null
    }
    return DIAL_CODES.map(([iso, code]) => ({
      iso,
      code,
      name: names?.of(iso) ?? iso,
    })).sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [q.type, locale])

  const setPart = (key, partValue) =>
    onChange({ ...(typeof value === 'object' && value !== null ? value : {}), [key]: partValue })

  switch (q.type) {
    case 'text':
    case 'email':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type={q.type === 'text' ? 'text' : 'email'}
              value={value ?? ''}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              maxLength={q.validation?.maxLength}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Field>
      )

    case 'phone': {
      // Legacy string answers render as a bare number with no code selected.
      const phone =
        typeof value === 'object' && value !== null
          ? value
          : { iso: '', code: '', number: value ?? '' }
      const selectedIso =
        phone.iso || DIAL_CODES.find(([, code]) => code === phone.code)?.[0] || ''
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <div style={{ display: 'flex', gap: 'var(--s-2, 0.5rem)' }}>
              <NativeSelect
                aria-label={tr('phoneCountryCode')}
                value={selectedIso}
                style={{ maxInlineSize: '45%' }}
                onChange={(e) => {
                  const opt = dialOptions.find((o) => o.iso === e.target.value)
                  onChange({ ...phone, iso: opt?.iso ?? '', code: opt?.code ?? '' })
                }}
              >
                <option value="">{tr('phoneCountryCode')}</option>
                {dialOptions.map((o) => (
                  <option key={o.iso} value={o.iso}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </NativeSelect>
              <Input
                id={id}
                type="tel"
                style={{ flex: 1 }}
                value={phone.number ?? ''}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => onChange({ ...phone, number: e.target.value })}
              />
            </div>
          )}
        </Field>
      )
    }

    case 'name': {
      const format = q.nameFormat ?? 'first_last'
      const v = typeof value === 'object' && value !== null ? value : {}
      const parts =
        format === 'full'
          ? ['full']
          : format === 'first_middle_last'
            ? ['first', 'middle', 'last']
            : ['first', 'last']
      const partLabel = { first: tr('firstName'), middle: tr('middleName'), last: tr('lastName'), full: tr('fullName') }
      return (
        <Field {...common}>
          {({ describedBy, invalid }) => (
            <div style={subGridStyle} role="group" aria-label={label}>
              {parts.map((key) => (
                <label key={key}>
                  <span style={subLabelStyle}>{partLabel[key]}</span>
                  <Input
                    value={v[key] ?? ''}
                    autoComplete="off"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    onChange={(e) => setPart(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
        </Field>
      )
    }

    case 'address': {
      const v = typeof value === 'object' && value !== null ? value : {}
      const parts = addressParts(q)
      const wide = new Set(['line1', 'line2'])
      return (
        <Field {...common}>
          {({ describedBy, invalid }) => (
            <div style={{ display: 'grid', gap: 'var(--s-3, 0.75rem)' }} role="group" aria-label={label}>
              {parts.filter((p) => wide.has(p.key)).map((p) => (
                <label key={p.key}>
                  <span style={subLabelStyle}>
                    {tr(`address_${p.key}`)}
                    {p.required && <span className="req" aria-hidden="true">*</span>}
                  </span>
                  <Input
                    value={v[p.key] ?? ''}
                    autoComplete="off"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    onChange={(e) => setPart(p.key, e.target.value)}
                  />
                </label>
              ))}
              <div style={subGridStyle}>
                {parts.filter((p) => !wide.has(p.key)).map((p) => (
                  <label key={p.key}>
                    <span style={subLabelStyle}>
                      {tr(`address_${p.key}`)}
                      {p.required && <span className="req" aria-hidden="true">*</span>}
                    </span>
                    <Input
                      value={v[p.key] ?? ''}
                      autoComplete="off"
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      onChange={(e) => setPart(p.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </Field>
      )
    }

    case 'textarea':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              value={value ?? ''}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              maxLength={q.validation?.maxLength}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Field>
      )

    case 'number':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              value={value ?? ''}
              min={q.validation?.min}
              max={q.validation?.max}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Field>
      )

    case 'date':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="date"
              value={value ?? ''}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Field>
      )

    case 'select':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <NativeSelect
              id={id}
              value={value ?? ''}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => onChange(e.target.value || undefined)}
            >
              <option value="" />
              {(q.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {lt(o.label, locale, defaultLocale)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )

    case 'radio':
      return (
        <Field {...common}>
          {() => (
            <RadioGroup value={value ?? ''} onValueChange={onChange}>
              {(q.options ?? []).map((o, i) => (
                <RadioRow
                  key={o.value}
                  id={`${groupId}-${i}`}
                  value={o.value}
                  checked={value === o.value}
                  label={lt(o.label, locale, defaultLocale)}
                />
              ))}
            </RadioGroup>
          )}
        </Field>
      )

    case 'multiselect': {
      const selected = Array.isArray(value) ? value : []
      const toggle = (v) =>
        onChange(
          selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
        )
      return (
        <Field {...common}>
          {() => (
            <div className="choice-group" role="group" aria-label={label}>
              {(q.options ?? []).map((o, i) => (
                <CheckboxRow
                  key={o.value}
                  id={`${groupId}-${i}`}
                  checked={selected.includes(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                  label={lt(o.label, locale, defaultLocale)}
                />
              ))}
            </div>
          )}
        </Field>
      )
    }

    case 'checkbox':
      return (
        <Field required={q.required} help={help} error={error}>
          {() => (
            <CheckboxRow
              id={groupId}
              checked={!!value}
              onCheckedChange={(c) => onChange(!!c)}
              label={label}
            />
          )}
        </Field>
      )

    case 'file':
      return (
        <FileUploadField
          question={q}
          label={label}
          help={help}
          error={error}
          value={value}
          onChange={onChange}
          preview={preview}
          uploadContext={uploadContext}
        />
      )

    default:
      return null
  }
}
