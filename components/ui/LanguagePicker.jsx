'use client'

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
 *
 * Navigation is a plain location assign rather than next/navigation's router:
 * switching language swaps the whole page's content anyway, and keeping the
 * hook out means this renders under a bare renderToStaticMarkup with no
 * app-router context (which is how the event page is tested).
 */
export function LanguagePicker({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  variant,
  className = '',
  title,
}) {
  if (!Array.isArray(options) || options.length < 2) return null

  function handleChange(e) {
    const next = e.target.value
    const href = options.find((o) => o.value === next)?.href
    if (href) window.location.assign(href)
    else onChange?.(next)
  }

  // The wrapper carries the chevron: ::after can't be placed on a <select>.
  return (
    <span className={`lang-picker-wrap ${className}`} data-variant={variant}>
      <select
        className="lang-picker"
        aria-label={ariaLabel}
        title={title}
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
