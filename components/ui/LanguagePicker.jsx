'use client'

// Plain next/navigation on purpose: option hrefs are fully-formed paths that
// already include the locale segment, so next-intl's router would prefix twice.
import { useRouter } from 'next/navigation'

/**
 * Language switcher for the languages an event is offered in — used by the
 * console editors and the public event/register pages.
 *
 * Always a dropdown rather than a row of buttons: events can carry a long list
 * of languages, and a button row stops being scannable well before that.
 * Renders nothing when there is only one language to choose from.
 *
 * `options` is a plain array of { value, label, href? } so this can be rendered
 * straight from a server component — hence data, not callbacks, for the hrefs.
 * An option with an `href` navigates on select; otherwise `onChange` fires.
 */
export function LanguagePicker({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  variant,
  className = '',
}) {
  const router = useRouter()
  if (!Array.isArray(options) || options.length < 2) return null

  function handleChange(e) {
    const next = e.target.value
    const href = options.find((o) => o.value === next)?.href
    if (href) router.push(href)
    else onChange?.(next)
  }

  // The wrapper carries the chevron: ::after can't be placed on a <select>.
  return (
    <span className={`lang-picker-wrap ${className}`} data-variant={variant}>
      <select
        className="lang-picker"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={handleChange}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}
