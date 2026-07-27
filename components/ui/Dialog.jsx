'use client'

import * as RadixDialog from '@radix-ui/react-dialog'

export function Dialog({ open, onOpenChange, title, children, trigger, className }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className={`dialog-content${className ? ` ${className}` : ''}`}>
          <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

Dialog.Close = RadixDialog.Close
