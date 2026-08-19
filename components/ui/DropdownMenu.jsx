'use client'

import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu'

/**
 * Action menu (Radix DropdownMenu).
 *
 * Deliberately NOT a <select>: a native select fires onChange as the arrow keys
 * move through it, so a keyboard user would trigger whatever the highlighted
 * entry does — unacceptable for a menu holding a destructive action. A real
 * menu navigates without activating, and gets menu/menuitem semantics.
 *
 * `trigger` is rendered as the button (asChild), so callers keep their own
 * .btn classes.
 */
export function DropdownMenu({ trigger, children, align = 'start', className }) {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          className={`menu-content${className ? ` ${className}` : ''}`}
          align={align}
          sideOffset={4}
          collisionPadding={8}
        >
          {children}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  )
}

/**
 * A plain action entry, for menus that DO something rather than filter.
 *
 * Unlike CheckboxItem it lets the menu close on select, because the action is
 * the end of the interaction. `tone="danger"` colours entries whose effect the
 * organizer would want to think about before clicking.
 */
DropdownMenu.Item = function DropdownMenuItem({ tone, children, ...rest }) {
  return (
    <RadixDropdownMenu.Item className="menu-item" data-tone={tone} {...rest}>
      {/* The same fixed gutter the checkable entries use, so a menu holding
          both kinds still lines its labels up. */}
      <span aria-hidden="true" style={{ inlineSize: 14, display: 'inline-flex', flexShrink: 0 }} />
      {children}
    </RadixDropdownMenu.Item>
  )
}

/**
 * A togglable entry, for menus that filter rather than act.
 *
 * `onSelect` preventDefaults so the menu stays open: the whole point of a
 * checklist is picking several things, and a menu that closed on each tick
 * would cost one reopen per choice.
 */
DropdownMenu.CheckboxItem = function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  ...rest
}) {
  return (
    <RadixDropdownMenu.CheckboxItem
      className="menu-item"
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(event) => event.preventDefault()}
      {...rest}
    >
      {/* Fixed-width gutter so the labels line up whether ticked or not —
          ItemIndicator renders nothing at all when unchecked. */}
      <span aria-hidden="true" style={{ inlineSize: 14, display: 'inline-flex', flexShrink: 0 }}>
        <RadixDropdownMenu.ItemIndicator>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6.5L4.5 9L10 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </RadixDropdownMenu.ItemIndicator>
      </span>
      {children}
    </RadixDropdownMenu.CheckboxItem>
  )
}

/**
 * Single-choice equivalent of CheckboxItem, for filters that genuinely take
 * one value. It deliberately does NOT hold the menu open: picking the one
 * answer is the end of the interaction, and closing confirms it — whereas a
 * checklist is not finished until the user says so.
 *
 * Same indicator gutter as CheckboxItem so a row of these filters lines up
 * whichever kind each one is.
 */
DropdownMenu.RadioGroup = RadixDropdownMenu.RadioGroup

DropdownMenu.RadioItem = function DropdownMenuRadioItem({ value, children, ...rest }) {
  return (
    <RadixDropdownMenu.RadioItem className="menu-item" value={value} {...rest}>
      <span aria-hidden="true" style={{ inlineSize: 14, display: 'inline-flex', flexShrink: 0 }}>
        <RadixDropdownMenu.ItemIndicator>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6.5L4.5 9L10 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </RadixDropdownMenu.ItemIndicator>
      </span>
      {children}
    </RadixDropdownMenu.RadioItem>
  )
}

/** One entry. `tone="danger"` colours it for a destructive action. */
DropdownMenu.Item = function DropdownMenuItem({ tone, onSelect, children, ...rest }) {
  return (
    <RadixDropdownMenu.Item
      className={`menu-item${tone === 'danger' ? ' menu-item-danger' : ''}`}
      onSelect={onSelect}
      {...rest}
    >
      {children}
    </RadixDropdownMenu.Item>
  )
}
