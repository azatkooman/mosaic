// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act, cleanup, render } from '@testing-library/react'
import { Intl } from '@/test/render'
import { Countdown } from './Countdown'

const NOW = Date.parse('2026-06-01T12:00:00Z')
// 2 days, 3 hours, 4 minutes and 5 seconds after NOW.
const TARGET = new Date(NOW + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000).toISOString()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const compact = (props = {}) => (
  <Intl><Countdown targetIso={TARGET} variant="compact" {...props} /></Intl>
)

describe('Countdown', () => {
  it('renders nothing on the server, since any snapshot would be stale by hydration', () => {
    expect(renderToString(compact())).toBe('')
  })

  it('shows the time left as soon as it mounts on the client', () => {
    const { container } = render(compact())
    expect(container.textContent).toBe('02d : 03h : 04m : 05s')
  })

  it('ticks once a second', () => {
    const { container } = render(compact())
    act(() => vi.advanceTimersByTime(1000))
    expect(container.textContent).toBe('02d : 03h : 04m : 04s')
    act(() => vi.advanceTimersByTime(65_000))
    expect(container.textContent).toBe('02d : 03h : 02m : 59s')
  })

  it('hides itself once the target has passed', () => {
    const soon = new Date(NOW + 2000).toISOString()
    const { container } = render(compact({ targetIso: soon }))
    expect(container.textContent).toBe('00d : 00h : 00m : 02s')
    act(() => vi.advanceTimersByTime(2000))
    expect(container.textContent).toBe('')
  })

  it('renders nothing for a past, missing or unparseable target', () => {
    for (const targetIso of [new Date(NOW - 1000).toISOString(), null, 'not a date']) {
      const { container, unmount } = render(compact({ targetIso }))
      expect(container.textContent).toBe('')
      unmount()
    }
  })

  it('restarts from the new target when the prop changes', () => {
    const { container, rerender } = render(compact())
    rerender(compact({ targetIso: new Date(NOW + 61_000).toISOString() }))
    expect(container.textContent).toBe('00d : 00h : 01m : 01s')
  })

  it('labels each unit in the default variant', () => {
    const { container } = render(
      <Intl><Countdown targetIso={TARGET} labelDays="D" labelHours="H" labelMinutes="M" labelSeconds="S" /></Intl>
    )
    expect(container.textContent).toBe('02D03H04M05S')
  })

  it('stops its timer on unmount', () => {
    const { unmount } = render(compact())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
