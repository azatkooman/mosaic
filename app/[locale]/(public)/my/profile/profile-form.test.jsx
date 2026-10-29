// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Intl } from '@/test/render'
import { stubMatchMedia } from '@/test/match-media'
import { fakeSupabase } from '@/test/supabase'

vi.mock('@/lib/i18n/navigation', () => ({
  usePathname: () => '/my/profile',
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
}))
let supabase = fakeSupabase()
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => supabase.client }))

const { ProfileForm } = await import('./ProfileForm')

beforeEach(() => {
  stubMatchMedia(false)
  // Radix's checkbox measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  delete document.documentElement.dataset.theme
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  supabase = fakeSupabase()
  delete document.documentElement.dataset.theme
  document.cookie = 'theme=; path=/; max-age=0'
})

const PROFILE = {
  full_name: 'Ada Lovelace',
  preferred_locale: 'en',
  theme: 'light',
  date_format: 'auto',
  time_format: 'auto',
  warn_unsaved_changes: true,
}

const form = (profile = PROFILE) => (
  <Intl>
    <ProfileForm userId="u1" initialProfile={profile} />
  </Intl>
)
const appearance = () => screen.getByLabelText('Appearance')
// The theme attribute is watched with a MutationObserver, whose callbacks run
// as microtasks, so let them settle inside act().
const settle = () => act(async () => {})

describe('ProfileForm appearance', () => {
  it('shows the theme the header toggle applied, and heals the saved preference to match', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(form({ ...PROFILE, theme: 'light' }))
    await settle()
    expect(appearance().value).toBe('dark')
    expect(supabase.updates).toContainEqual({ table: 'profiles', patch: { theme: 'dark' } })
  })

  it('does not write when the applied theme already matches the saved one', async () => {
    document.documentElement.dataset.theme = 'light'
    render(form({ ...PROFILE, theme: 'light' }))
    await settle()
    expect(appearance().value).toBe('light')
    expect(supabase.updates).toEqual([])
  })

  it('applies the saved preference when nothing is forced yet', async () => {
    render(form({ ...PROFILE, theme: 'dark' }))
    await settle()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(appearance().value).toBe('dark')
  })

  it('shows System when the saved preference is to follow the device', async () => {
    render(form({ ...PROFILE, theme: 'system' }))
    await settle()
    expect(appearance().value).toBe('system')
  })

  it('follows the header toggle live', async () => {
    document.documentElement.dataset.theme = 'light'
    render(form())
    await settle()
    act(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await settle()
    expect(appearance().value).toBe('dark')
  })

  it('previews a picked theme before saving', async () => {
    document.documentElement.dataset.theme = 'light'
    render(form())
    await settle()
    fireEvent.change(appearance(), { target: { value: 'system' } })
    await settle()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(appearance().value).toBe('system')
    fireEvent.change(appearance(), { target: { value: 'dark' } })
    await settle()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(appearance().value).toBe('dark')
  })
})
