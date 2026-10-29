// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Intl } from '@/test/render'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { UnsavedChangesGuard } = await import('./UnsavedChangesGuard')

// Record whether the guard held each click, then stop jsdom from attempting
// the navigation itself (it logs "not implemented" for every followed link).
let held = null
const record = (event) => {
  held = event.defaultPrevented
  event.preventDefault()
}
beforeEach(() => window.addEventListener('click', record))
afterEach(() => {
  window.removeEventListener('click', record)
  cleanup()
  push.mockReset()
})

// What a next/link to another console page renders: a same-origin <a>.
const ELSEWHERE = new URL('/elsewhere', window.location.href).href

const page = (props) => (
  <Intl>
    <a href={ELSEWHERE}>Team</a>
    <a href="https://example.org/">Elsewhere</a>
    <UnsavedChangesGuard enabled {...props} />
  </Intl>
)

// True when the guard let the click through.
const clickLink = (name, init) => {
  fireEvent.click(screen.getByRole('link', { name }), init)
  return !held
}
const dialogShown = () => screen.queryByRole('dialog') != null

describe('UnsavedChangesGuard', () => {
  it('holds an in-app link click and asks when there is unsaved work', () => {
    render(page({ when: true }))
    expect(clickLink('Team')).toBe(false)
    expect(dialogShown()).toBe(true)
  })

  it('lets the click through when nothing is dirty', () => {
    render(page({ when: false }))
    expect(clickLink('Team')).toBe(true)
    expect(dialogShown()).toBe(false)
  })

  it('lets the click through when the organizer turned the warning off', () => {
    render(page({ when: true, enabled: false }))
    expect(clickLink('Team')).toBe(true)
  })

  it('follows dirty flipping mid-session in both directions', () => {
    const { rerender } = render(page({ when: false }))
    rerender(page({ when: true }))
    expect(clickLink('Team')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /stay/i }))
    rerender(page({ when: false }))
    expect(clickLink('Team')).toBe(true)
  })

  it('leaves off-site links to beforeunload instead of asking twice', () => {
    render(page({ when: true }))
    expect(clickLink('Elsewhere')).toBe(true)
    expect(dialogShown()).toBe(false)
  })

  it('ignores modified clicks, which open elsewhere', () => {
    render(page({ when: true }))
    expect(clickLink('Team', { metaKey: true })).toBe(true)
  })

  it('navigates to the held link when the organizer chooses to leave', () => {
    render(page({ when: true }))
    clickLink('Team')
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(push).toHaveBeenCalledWith('/elsewhere')
  })

  it('asks the browser before unload only while armed', () => {
    const { rerender } = render(page({ when: true }))
    const armed = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(armed)
    expect(armed.defaultPrevented).toBe(true)
    rerender(page({ when: false }))
    const disarmed = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(disarmed)
    expect(disarmed.defaultPrevented).toBe(false)
  })
})
