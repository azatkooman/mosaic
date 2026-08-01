'use client'

/**
 * A date / datetime-local field.
 *
 * This used to render a read-only text proxy showing the value in the user's
 * profile format, with the real <input type="date"> hidden beside it at 1px /
 * opacity:0 / pointer-events:none and opened through showPicker(). That did
 * not survive contact with mobile Chrome: showPicker() on an input the user
 * cannot see is refused, and the fallback — focusing that same invisible
 * input — produces nothing on Android, so tapping a date question simply did
 * nothing. The proxy was also readOnly with a transparent caret (no date could
 * ever be typed), and the hidden input was aria-hidden yet still focusable,
 * which is an ARIA violation axe flags.
 *
 * So it is now just the native control. That buys the OS picker on mobile,
 * typing and arrow-keys on desktop, autofill, and correct semantics — none of
 * which the proxy could offer.
 *
 * The trade-off: a native date input always renders in the *browser's* locale
 * format and cannot be reformatted. The profile date-format preference still
 * governs everywhere a date is DISPLAYED (participants table, participant
 * detail, exports) — it no longer applies to this one entry field.
 *
 * Value in/out is unchanged: 'YYYY-MM-DD' for date, 'YYYY-MM-DDTHH:mm' for
 * datetime-local.
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
  return (
    <input
      id={id}
      type={type}
      className="input"
      value={value ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      // aria-required rather than the native attribute: the wizard and the
      // console forms report their own validation in the UI language, and a
      // browser validation bubble would speak the browser's instead.
      aria-required={required || undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
