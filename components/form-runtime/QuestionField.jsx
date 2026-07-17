'use client'

import { useId } from 'react'
import { lt } from '@/lib/i18n/locales'
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
import { PhoneInput } from './PhoneField'

/** Renders one question of any type. Value semantics per type:
 *  text/textarea/email/phone/date: string · number: string|number ·
 *  select/radio: option value · multiselect: string[] · checkbox: boolean ·
 *  file: storage object path string
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
  const label = lt(q.label, locale, defaultLocale)
  const help = q.help ? lt(q.help, locale, defaultLocale) : undefined

  const common = { label, required: q.required, help, error }

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

    case 'phone':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <PhoneInput
              id={id}
              describedBy={describedBy}
              invalid={invalid}
              value={value}
              onChange={onChange}
              maxLength={q.validation?.maxLength}
              locale={locale}
            />
          )}
        </Field>
      )

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
