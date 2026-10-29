import { vi } from 'vitest'

// jsdom has no matchMedia. This one answers every query with one switchable
// value and lets a test flip it the way the OS does at sunset.
export function stubMatchMedia(initial = false) {
  let matches = initial
  const listeners = new Set()
  vi.stubGlobal('matchMedia', (query) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  }))
  return {
    set(next) {
      matches = next
      for (const fn of [...listeners]) fn({ matches: next })
    },
    listenerCount: () => listeners.size,
  }
}
