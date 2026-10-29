// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Intl } from '@/test/render'
import { fakeSupabase } from '@/test/supabase'

let pathname = '/console'
const refresh = vi.fn()
const replace = vi.fn()
vi.mock('@/lib/i18n/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh, replace }),
}))
let supabase = fakeSupabase()
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => supabase.client }))

const { NameCaptureDialog } = await import('./NameCaptureDialog')

afterEach(() => {
  cleanup()
  pathname = '/console'
  refresh.mockReset()
  replace.mockReset()
  supabase = fakeSupabase()
})

const dialog = (props) => (
  <Intl>
    <NameCaptureDialog userId="u1" initialLocale="en" {...props} />
  </Intl>
)
const isOpen = () => screen.queryByRole('dialog', { name: 'Welcome to Mosaic' }) != null

describe('NameCaptureDialog', () => {
  it('is closed in the server render, so hydration matches', () => {
    expect(renderToString(dialog())).not.toContain('Welcome to Mosaic')
  })

  it('opens once mounted on an ordinary page', () => {
    render(dialog())
    expect(isOpen()).toBe(true)
  })

  it('stays out of the way of a registration in progress', () => {
    pathname = '/events/summer-camp/register'
    render(dialog())
    expect(isOpen()).toBe(false)
  })

  it('opens on leaving the registration flow for another page', () => {
    pathname = '/events/summer-camp/register'
    const { rerender } = render(dialog())
    pathname = '/my/registrations'
    rerender(dialog())
    expect(isOpen()).toBe(true)
  })

  it('cannot be dismissed with Escape: saving is the only way out', () => {
    render(dialog())
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(isOpen()).toBe(true)
  })

  it('requires both names when the profile has none', async () => {
    render(dialog())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save|continue/i }))
    })
    expect(isOpen()).toBe(true)
    expect(supabase.updates).toEqual([])
  })

  it('saves, closes and refreshes so the server stops rendering it', async () => {
    render(dialog())
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: ' Ada ' } })
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Lovelace' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save|continue/i }))
    })
    expect(supabase.updates[0].patch).toMatchObject({ full_name: 'Ada Lovelace', preferred_locale: 'en' })
    expect(isOpen()).toBe(false)
    expect(refresh).toHaveBeenCalled()
  })

  it('stays closed after saving across a re-render on the same page', async () => {
    const { rerender } = render(dialog({ needsName: false }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save|continue/i }))
    })
    rerender(dialog({ needsName: false }))
    expect(isOpen()).toBe(false)
  })
})
