'use client'

import * as RadixPopover from '@radix-ui/react-popover'

/**
 * A panel of controls anchored to a button.
 *
 * Deliberately NOT DropdownMenu, which is the right primitive for a list of
 * things to pick and the wrong one for a form: its content is a `role="menu"`
 * whose children are menu items, with arrow-key navigation and typeahead that
 * swallow the keystrokes a text field needs. A popover is just a panel — focus
 * and typing behave as they do anywhere else.
 *
 * Shares `menu-content` with DropdownMenu so the two read as the same surface;
 * only what goes inside them differs.
 *
 * `trigger` is rendered as the button (asChild), so callers keep their own
 * .btn classes.
 */
export function Popover({ trigger, children, align = 'start', className }) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className={`menu-content${className ? ` ${className}` : ''}`}
          align={align}
          sideOffset={4}
          collisionPadding={8}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
