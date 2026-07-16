'use client'

import * as RadixTooltip from '@radix-ui/react-tooltip'

/**
 * Small "ⓘ" icon that reveals help text on hover/focus (tap on touch).
 * Use next to a field label for hints that shouldn't clutter the layout.
 */
export function InfoTip({ text, label = 'More info' }) {
  return (
    <RadixTooltip.Provider delayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          <button type="button" className="infotip-trigger" aria-label={label}>
            ?
          </button>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="infotip-content" sideOffset={6} collisionPadding={8}>
            {text}
            <RadixTooltip.Arrow className="infotip-arrow" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
