import { useId } from 'react'
import { InfoTip } from './Tooltip'

/**
 * Accessible field wrapper: label + control + help/error wiring.
 * Renders children via a function receiving {id, describedBy, invalid}.
 * `help` renders below the control; `hint` renders as an ⓘ tooltip
 * next to the label instead.
 */
export function Field({ label, required, help, hint, error, children }) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className="field">
      {label != null && (
        <span className="field-label-row">
          <label className="field-label" htmlFor={id}>
            {label}
            {required && <span className="req" aria-hidden="true">*</span>}
          </label>
          {hint && <InfoTip text={hint} />}
        </span>
      )}
      {typeof children === 'function'
        ? children({ id, describedBy, invalid: !!error })
        : children}
      {help && (
        <p className="field-help" id={helpId}>
          {help}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`input ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`textarea ${className}`} {...props} />
}

export function NativeSelect({ className = '', children, ...props }) {
  return (
    <select className={`select-native ${className}`} {...props}>
      {children}
    </select>
  )
}
