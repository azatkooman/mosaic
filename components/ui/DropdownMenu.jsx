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
