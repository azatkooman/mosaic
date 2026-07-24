'use client'

import { useRef } from 'react'
import { useLocale } from 'next-intl'
import { useDateFormatPrefs } from '@/components/providers/DateFormatProvider'
import { formatDateValue, formatLocalInput, dateInputPattern } from '@/lib/dates'

/**
 * A date / datetime-local field that DISPLAYS its value in the user's profile
 * format preference (dmy / mdy / ymd, 12h / 24h) instead of the browser
 * locale — native <input type="date"> can't be reformatted. A read-only text
 * proxy shows the formatted value; the real native input (kept for the OS
 * picker + validation) is triggered via showPicker(). Value in/out is
 * unchanged: 'YYYY-MM-DD' for date, 'YYYY-MM-DDTHH:mm' for datetime-local.
 */
export function PreferenceDateInput({
  id,
  type = 'date',
  value,
  onChange,
  required = false,
  disabled = false,
  describedBy,
  invalid,
}) {
  const locale = useLocale()
  const prefs = useDateFormatPrefs()
  const nativeRef = useRef(null)

  const display = !value
    ? ''
    : type === 'datetime-local'
      ? formatLocalInput(value, locale, prefs)
      : formatDateValue(value, locale, prefs)
  const hint = dateInputPattern(type, prefs, locale)

  function openPicker() {
    const n = nativeRef.current
    if (!n || disabled) return
    if (typeof n.showPicker === 'function') {
      try {
        n.showPicker()
        return
      } catch {
        // showPicker throws without a user gesture in some browsers — fall
        // back to focusing the native control so the keyboard picker opens.
      }
    }
    n.focus()
  }

  return (
    <span className="pref-date">
      <input
        type="text"
        id={id}
        readOnly
        value={display}
        placeholder={hint}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-required={required || undefined}
        className="input pref-date-text"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
      />
      <span className="pref-date-icon" aria-hidden="true">📅</span>
      <input
        ref={nativeRef}
        type={type}
        value={value ?? ''}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pref-date-native"
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  )
}
