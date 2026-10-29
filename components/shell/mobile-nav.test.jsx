// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

let pathname = '/en/console'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { MobileNav } = await import('./MobileNav')

afterEach(() => {
  cleanup()
  pathname = '/en/console'
  document.body.style.overflow = ''
})

const nav = () => (
  <MobileNav label="Menu">
    <a href="#registrations">My registrations</a>
    <select aria-label="Language"><option>en</option></select>
  </MobileNav>
)

const toggle = () => screen.getByRole('button', { name: 'Menu' })
const isOpen = () => toggle().getAttribute('aria-expanded') === 'true'

describe('MobileNav', () => {
  it('starts closed and opens from the menu button', () => {
    render(nav())
    expect(isOpen()).toBe(false)
    fireEvent.click(toggle())
    expect(isOpen()).toBe(true)
    expect(screen.getByRole('navigation', { name: 'Menu' })).toBeTruthy()
  })

  it('locks page scroll while open and restores it on close', () => {
    document.body.style.overflow = 'auto'
    render(nav())
    fireEvent.click(toggle())
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(toggle())
    expect(document.body.style.overflow).toBe('auto')
  })

  it('closes on Escape', () => {
    render(nav())
    fireEvent.click(toggle())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(isOpen()).toBe(false)
  })

  it('closes on a link click but stays open for other controls inside it', () => {
    render(nav())
    fireEvent.click(toggle())
    fireEvent.click(screen.getByRole('combobox', { name: 'Language' }))
    expect(isOpen()).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: 'My registrations' }))
    expect(isOpen()).toBe(false)
  })

  it('closes when the route changes without a click (back button, redirect)', () => {
    const { rerender } = render(nav())
    fireEvent.click(toggle())
    pathname = '/en/my'
    rerender(nav())
    expect(isOpen()).toBe(false)
  })

  it('stays open across a re-render on the same route', () => {
    const { rerender } = render(nav())
    fireEvent.click(toggle())
    rerender(nav())
    expect(isOpen()).toBe(true)
  })
})
