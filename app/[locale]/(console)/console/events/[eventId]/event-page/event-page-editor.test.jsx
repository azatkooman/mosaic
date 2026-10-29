// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { Intl } from '@/test/render'
import { stubMatchMedia } from '@/test/match-media'

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }) => <a href={String(href)} {...rest}>{children}</a>,
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => ({}) }))

const { EventPageEditor, ColorField, useIsDarkMode } = await import('./EventPageEditor')

let media
beforeEach(() => {
  media = stubMatchMedia(false)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EVENT = {
  id: 'e1',
  slug: 'summer-camp',
  status: 'published',
  default_locale: 'en',
  name: { en: 'Summer Camp', fr: 'Camp d’été' },
  page_content: { i18n: { available: ['en', 'fr'] } },
}

async function copiedUrl({ locale = 'en', event = EVENT } = {}) {
  const writeText = vi.fn().mockResolvedValue()
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  render(
    <Intl locale={locale}>
      <EventPageEditor initialEvent={event} />
    </Intl>
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }))
  })
  return writeText.mock.calls[0][0]
}

describe('EventPageEditor public link', () => {
  it('is absolute, built from the browser origin once mounted', async () => {
    expect(await copiedUrl()).toBe(`${window.location.origin}/en/events/summer-camp`)
  })

  it('previews in the console language when the event offers it', async () => {
    expect(await copiedUrl({ locale: 'fr' })).toBe(`${window.location.origin}/fr/events/summer-camp`)
  })

  it('falls back to the default language when the console language is not offered', async () => {
    const event = { ...EVENT, page_content: { i18n: { available: ['en'] } } }
    expect(await copiedUrl({ locale: 'fr', event })).toBe(`${window.location.origin}/en/events/summer-camp`)
  })
})

describe('useIsDarkMode', () => {
  it('is light on the server, so the first client render matches', () => {
    media.set(true)
    function Probe() {
      return useIsDarkMode() ? 'dark' : 'light'
    }
    expect(renderToString(<Probe />)).toBe('light')
  })

  it('reads the OS setting on the client and follows it as it changes', () => {
    media.set(true)
    const { result, unmount } = renderHook(() => useIsDarkMode())
    expect(result.current).toBe(true)
    act(() => media.set(false))
    expect(result.current).toBe(false)
    unmount()
    expect(media.listenerCount()).toBe(0)
  })
})

describe('event page ColorField', () => {
  const field = (props) => (
    <ColorField label="Page" addLabel="Add color" resetLabel="Reset" defaultValue="#ffffff" onChange={() => {}} {...props} />
  )
  const swatch = (container) => container.querySelector('input[type="color"]')
  const addButton = () => screen.getByRole('button', { name: 'Add color' })

  it('stages a picked colour without applying it until Add color', () => {
    const onChange = vi.fn()
    const { container } = render(field({ onChange }))
    expect(swatch(container).value).toBe('#ffffff')
    expect(addButton().disabled).toBe(false)
    fireEvent.input(swatch(container), { target: { value: '#ff0000' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(addButton())
    expect(onChange).toHaveBeenCalledWith('#ff0000')
  })

  it('shows Add color as done once the staged colour is the applied one', () => {
    render(field({ value: '#123456' }))
    expect(addButton().disabled).toBe(true)
  })

  it('offers Reset only when a colour is set, and resets to null', () => {
    const onChange = vi.fn()
    const { rerender } = render(field({ onChange }))
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    rerender(field({ onChange, value: '#123456' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('drops a staged colour when the applied value changes from outside', () => {
    const { container, rerender } = render(field({ value: '#123456' }))
    fireEvent.input(swatch(container), { target: { value: '#ff0000' } })
    rerender(field({ value: '#abcdef' }))
    expect(swatch(container).value).toBe('#abcdef')
    rerender(field({ value: undefined, defaultValue: '#000000' }))
    expect(swatch(container).value).toBe('#000000')
  })

  it('keeps a staged colour across a re-render with the same value', () => {
    const { container, rerender } = render(field({ value: '#123456' }))
    fireEvent.input(swatch(container), { target: { value: '#ff0000' } })
    rerender(field({ value: '#123456' }))
    expect(swatch(container).value).toBe('#ff0000')
  })
})
