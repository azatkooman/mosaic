// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { DateFormatProvider, useDateFormatPrefs } from './DateFormatProvider'

afterEach(cleanup)

function Show() {
  const { dateFormat, timeFormat } = useDateFormatPrefs()
  return <output>{`${dateFormat}|${timeFormat}`}</output>
}

const tree = (value) => (
  <DateFormatProvider value={value}>
    <Show />
  </DateFormatProvider>
)
const shown = () => screen.getByRole('status').textContent
const announce = (detail) =>
  act(() => window.dispatchEvent(new CustomEvent('mosaic:datefmt', { detail })))

describe('DateFormatProvider', () => {
  it('provides the server-read cookie value', () => {
    render(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    expect(shown()).toBe('dmy|24h')
  })

  it('follows a change announced elsewhere in the session without a reload', () => {
    render(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    announce({ dateFormat: 'mdy', timeFormat: '12h' })
    expect(shown()).toBe('mdy|12h')
  })

  it('treats missing fields in an announcement as auto, and ignores empty ones', () => {
    render(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    announce(null)
    expect(shown()).toBe('dmy|24h')
    announce({ dateFormat: 'ymd' })
    expect(shown()).toBe('ymd|auto')
  })

  it('keeps an announced change when the server re-renders with the same cookie values', () => {
    const { rerender } = render(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    announce({ dateFormat: 'mdy', timeFormat: '12h' })
    // A fresh object with identical values, as a parent re-render produces.
    rerender(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    expect(shown()).toBe('mdy|12h')
  })

  it('re-syncs when a server render supplies new cookie values', () => {
    const { rerender } = render(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    announce({ dateFormat: 'mdy', timeFormat: '12h' })
    rerender(tree({ dateFormat: 'ymd', timeFormat: '24h' }))
    expect(shown()).toBe('ymd|24h')
  })

  it('stops listening on unmount', () => {
    const { unmount } = render(tree({ dateFormat: 'dmy', timeFormat: '24h' }))
    unmount()
    expect(() => announce({ dateFormat: 'mdy' })).not.toThrow()
  })
})
