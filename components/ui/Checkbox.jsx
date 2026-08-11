'use client'

import * as RadixCheckbox from '@radix-ui/react-checkbox'

const boxStyle = {
  width: 20,
  height: 20,
  flexShrink: 0,
  borderRadius: 5,
  border: '1.5px solid var(--line-strong)',
  background: 'var(--surface)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 2,
}

function CheckIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2 6.5L4.5 9L10 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Checkbox({ checked, onCheckedChange, id, size = 'md', ...props }) {
  const small = size === 'sm'
  return (
    <RadixCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      style={{
        ...boxStyle,
        ...(small ? { width: 16, height: 16, borderRadius: 4, marginTop: 1 } : null),
        background: checked ? 'var(--pine)' : 'var(--surface)',
        borderColor: checked ? 'var(--pine)' : 'var(--line-strong)',
        color: '#fff',
        cursor: 'pointer',
        padding: 0,
      }}
      {...props}
    >
      <RadixCheckbox.Indicator>
        <CheckIcon size={small ? 10 : 12} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
}

/**
 * A checkbox with its label in a bordered, clickable row.
 *
 * `size="sm"` is for a single preference living among labelled fields, where
 * the default row outweighs the settings around it.
 */
export function CheckboxRow({ checked, onCheckedChange, label, id, size = 'md' }) {
  return (
    <label
      className={`choice-row${size === 'sm' ? ' choice-row-sm' : ''}`}
      data-checked={checked || undefined}
      htmlFor={id}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} size={size} />
      <span>{label}</span>
    </label>
  )
}
