// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Intl } from '@/test/render'
import { stubMatchMedia } from '@/test/match-media'

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }) => <a href={String(href)} {...rest}>{children}</a>,
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

// Every draft write and publish goes through here; `saveError` decides whether
// the next form_versions update fails.
let saveError = null
const writes = []
const supabase = {
  from: (table) => ({
    update: (patch) => ({
      eq: () => {
        writes.push({ table, patch })
        return Promise.resolve({ error: saveError })
      },
    }),
  }),
  rpc: () => Promise.resolve({ error: null }),
}
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => supabase }))

const { FormBuilder } = await import('./FormBuilder')
const { useBuilderStore } = await import('./store')

const DEFINITION = { questions: [{ id: 'q1', type: 'text', label: { en: 'Allergies' } }] }

const fetchMock = vi.fn()
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  stubMatchMedia(false)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
  saveError = null
  writes.length = 0
  // The store is module state; start each test from a clean page load.
  useBuilderStore.getState().init({ questions: [] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// What a next/link to another console page renders: a same-origin <a>.
const ELSEWHERE = new URL('/elsewhere', window.location.href).href

const builder = (props = {}) => (
  <Intl>
    <a href={ELSEWHERE}>Team</a>
    <FormBuilder
      versionId="v1"
      versionNumber={2}
      initialDefinition={DEFINITION}
      participantTypes={[{ key: 'staff', name: { en: 'Staff' } }]}
      eventName={{ en: 'Summer Camp' }}
      formId="f1"
      eventId="e1"
      initialAppearance={{}}
      eventTheme={{}}
      defaultLocale="en"
      supportedLocales={['en', 'fr']}
      localeNames={{ en: 'English', fr: 'Français' }}
      {...props}
    />
  </Intl>
)

const edit = (label) =>
  act(() => useBuilderStore.getState().updateQuestion('q1', { label: { en: label } }))
const advance = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms))
const status = (text) => screen.queryByText(text) != null
const editLanguage = () => screen.getByRole('combobox', { name: 'Edit language' })
const draftWrites = () => writes.filter((w) => w.table === 'form_versions')

describe('FormBuilder draft autosave', () => {
  it('says Saving… as soon as there is an edit, then writes the draft after a pause', async () => {
    render(builder())
    expect(status('Saving…')).toBe(false)
    edit('Allergies and diet')
    expect(status('Saving…')).toBe(true)
    await advance(1199)
    expect(draftWrites()).toHaveLength(0)
    await advance(1)
    expect(draftWrites()).toHaveLength(1)
    expect(status('Draft saved')).toBe(true)
  })

  it('restarts the pause on every edit, so a burst of typing writes once', async () => {
    render(builder())
    edit('A')
    await advance(800)
    edit('Al')
    await advance(800)
    expect(draftWrites()).toHaveLength(0)
    await advance(400)
    expect(draftWrites()).toHaveLength(1)
    expect(draftWrites()[0].patch.definition.questions[0].label.en).toBe('Al')
  })

  it('lets "Draft saved" fade after a few seconds', async () => {
    render(builder())
    edit('Diet')
    await advance(1200)
    await advance(4000)
    expect(status('Draft saved')).toBe(false)
    expect(status('Saving…')).toBe(false)
  })

  it('says so loudly when a write fails, and goes back to Saving… on the next edit', async () => {
    saveError = { message: 'JWT expired' }
    render(builder())
    edit('Diet')
    await advance(1200)
    expect(status('Saving failed — your latest changes are not stored')).toBe(true)
    // A failure is a condition, not an announcement: it does not fade.
    await advance(10_000)
    expect(status('Saving failed — your latest changes are not stored')).toBe(true)
    edit('Diet!')
    expect(status('Saving…')).toBe(true)
  })
})

describe('FormBuilder unpublished guard', () => {
  it('does not ask on a form nobody edited', () => {
    render(builder())
    fireEvent.click(screen.getByRole('link', { name: 'Team' }))
    expect(screen.queryByText('Publish your changes?')).toBeNull()
  })

  it('asks to publish once anything was edited, even after the draft saved', async () => {
    render(builder())
    edit('Diet')
    await advance(1200)
    fireEvent.click(screen.getByRole('link', { name: 'Team' }))
    expect(screen.queryByText('Publish your changes?')).not.toBeNull()
  })

  it('stops asking once published', async () => {
    render(builder())
    edit('Diet')
    await advance(1200)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish Form' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('link', { name: 'Team' }))
    expect(screen.queryByText('Publish your changes?')).toBeNull()
  })
})

describe('FormBuilder edit language', () => {
  it('does not translate on arrival', async () => {
    render(builder())
    await advance(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('catches every other language up when the organizer switches language', async () => {
    render(builder({ supportedLocales: ['en', 'fr', 'es'] }))
    fireEvent.change(editLanguage(), { target: { value: 'fr' } })
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/translate-form')
    expect(body).toMatchObject({ source: 'en', targets: ['fr', 'es'], force: false })
  })

  it('does not translate again when the server re-sends the same languages', async () => {
    const { rerender } = render(builder())
    rerender(builder({ supportedLocales: ['en', 'fr'] }))
    await advance(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the default language when the one being edited is removed', async () => {
    const { rerender } = render(builder({ supportedLocales: ['en', 'fr', 'es'] }))
    fireEvent.change(editLanguage(), { target: { value: 'es' } })
    await advance(0)
    rerender(builder({ supportedLocales: ['en', 'fr'] }))
    expect(editLanguage().value).toBe('en')
  })
})
