// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Intl } from '@/test/render'

const refresh = vi.fn()
vi.mock('@/lib/i18n/navigation', () => ({ useRouter: () => ({ refresh, push: () => {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

// Any query chain resolves to an empty success; updates are recorded.
const statusWrites = []
const result = { count: 1, data: [], error: null }
function chain() {
  const q = new Proxy(() => {}, {
    get: (_t, prop) =>
      prop === 'then' ? (resolve) => Promise.resolve(result).then(resolve) : () => q,
  })
  return q
}
const supabase = {
  from: (table) => {
    const q = chain()
    return new Proxy({}, {
      get: (_t, prop) =>
        prop === 'update'
          ? (patch) => {
              statusWrites.push({ table, patch })
              return chain()
            }
          : q[prop],
    })
  },
  rpc: () => chain(),
}
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => supabase }))

const { EventSettingsForm } = await import('./EventSettingsForm')

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
  statusWrites.length = 0
  refresh.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EVENT = {
  id: 'e1',
  slug: 'summer-camp',
  status: 'draft',
  timezone: 'UTC',
  default_locale: 'en',
  name: { en: 'Summer Camp' },
  page_content: { i18n: { available: ['en', 'fr', 'es'] } },
}
const TYPES = [{ id: 't1', key: 'staff', name: { en: 'Staff' }, capacity: null, form_id: 'f1' }]
const FORMS = [{ id: 'f1', title: 'Default' }]

const settings = (event = EVENT) => (
  <Intl>
    <EventSettingsForm event={event} initialTypes={TYPES} forms={FORMS} newTypeLabels={{ en: 'New type' }} />
  </Intl>
)
const confettiCount = () => document.querySelectorAll('.confetti-burst').length
const nameInputs = () => screen.getAllByLabelText('Name (en)')

async function addCustomType() {
  fireEvent.click(screen.getByRole('button', { name: 'Add type' }))
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Create my own' }))
  })
}

describe('EventSettingsForm publish', () => {
  it('celebrates a publish, and again on a later re-publish', async () => {
    const { rerender } = render(settings())
    expect(confettiCount()).toBe(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    })
    expect(statusWrites).toContainEqual({ table: 'events', patch: { status: 'published' } })
    expect(confettiCount()).toBe(1)
    expect(refresh).toHaveBeenCalled()

    rerender(settings({ ...EVENT, status: 'published' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))
    })
    rerender(settings({ ...EVENT, status: 'draft' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    })
    expect(confettiCount()).toBe(1)
  })
})

describe('EventSettingsForm staged participant types', () => {
  it('stages each added type as its own row, even within the same millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-06-01T12:00:00Z'))
    try {
      render(settings())
      expect(nameInputs()).toHaveLength(1)
      await addCustomType()
      await addCustomType()
      expect(nameInputs()).toHaveLength(3)
      // Rows are addressed by their staged id: if two shared one, editing
      // either would rename both.
      fireEvent.change(nameInputs()[1], { target: { value: 'Chaperone' } })
      expect(nameInputs().map((i) => i.value)).toEqual(['Staff', 'Chaperone', 'New type'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('lights up Save for a staged type without writing anything yet', async () => {
    render(settings())
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true)
    await addCustomType()
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false)
    expect(statusWrites).toEqual([])
  })
})

describe('EventSettingsForm language removal warning', () => {
  it('names every language the save would drop', async () => {
    render(settings())
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(removeButtons[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove language?' })
    expect(within(dialog).getByText(/Removing Español, Français permanently deletes/)).toBeTruthy()
  })

  it('saves straight away when no saved language is dropped', async () => {
    render(settings())
    await addCustomType()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog', { name: 'Remove language?' })).toBeNull()
  })
})
