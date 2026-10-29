// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Intl } from '@/test/render'

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }) => <a href={String(href)} {...rest}>{children}</a>,
}))

const { RegistrationWizard } = await import('./RegistrationWizard')

const KEY = 'mosaic-draft-summer-camp'
const QUESTIONS = { questions: [{ id: 'q1', type: 'text', label: { en: 'Allergies' } }] }
const TYPES = [
  { key: 'staff', name: { en: 'Staff' }, definition: QUESTIONS },
  { key: 'student', name: { en: 'Student' }, definition: QUESTIONS },
]
const EVENT = { id: 'e1', slug: 'summer-camp', default_locale: 'en', name: { en: 'Summer Camp' } }

const familyDraft = {
  counts: { staff: 1, student: 1 },
  people: [
    { participantTypeKey: 'staff', answers: { q1: 'none' } },
    { participantTypeKey: 'student', answers: {} },
  ],
  step: 'mode',
  personIndex: 0,
  mode: 'family',
  singleTypeKey: null,
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const wizard = (props = {}) => (
  <Intl>
    <RegistrationWizard event={EVENT} participantTypes={TYPES} userId="u1" backHref="/en/events/summer-camp" {...props} />
  </Intl>
)
const save = (draft) => localStorage.setItem(KEY, JSON.stringify(draft))
const stored = () => JSON.parse(localStorage.getItem(KEY))
const restoredNotice = () => screen.queryByText('We restored your in-progress registration.')
const familyChosen = () => screen.getByRole('radio', { name: /group/i }).getAttribute('aria-checked') === 'true'

describe('RegistrationWizard draft restore', () => {
  it('server-renders the opening state, so hydration never sees the draft', () => {
    save(familyDraft)
    expect(renderToString(wizard())).not.toContain('We restored')
  })

  it('restores a usable draft on mount and says so', () => {
    save(familyDraft)
    render(wizard())
    expect(restoredNotice()).not.toBeNull()
    expect(familyChosen()).toBe(true)
  })

  it('keeps the restored draft in storage', async () => {
    save(familyDraft)
    render(wizard())
    await act(async () => {})
    expect(stored()).toEqual(familyDraft)
  })

  it('discards a draft that names a participant type the event no longer has', async () => {
    save({ ...familyDraft, people: [{ participantTypeKey: 'chaperone', answers: {} }] })
    render(wizard())
    await act(async () => {})
    expect(restoredNotice()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('discards a draft whose counts name a removed type', async () => {
    save({ ...familyDraft, counts: { staff: 1, chaperone: 1 } })
    render(wizard())
    await act(async () => {})
    expect(restoredNotice()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('lets a ?type= link win over a draft for a different type, and drops the draft', async () => {
    save({ ...familyDraft, mode: 'single', singleTypeKey: 'staff', people: [familyDraft.people[0]] })
    render(wizard({ preselectedTypeKey: 'student' }))
    await act(async () => {})
    expect(localStorage.getItem(KEY)).not.toContain('"singleTypeKey":"staff"')
    expect(restoredNotice()).toBeNull()
  })

  it('ignores a corrupted draft and starts fresh', () => {
    localStorage.setItem(KEY, '{not json')
    render(wizard())
    expect(restoredNotice()).toBeNull()
    expect(familyChosen()).toBe(false)
  })

  it('drops an unknown mode and clamps the person index to the people restored', async () => {
    save({ ...familyDraft, mode: 'bogus', personIndex: 9 })
    render(wizard())
    await act(async () => {})
    expect(stored()).toMatchObject({ mode: null, personIndex: 1 })
  })

  it('starts fresh with nothing saved, and saves nothing until someone is added', async () => {
    render(wizard())
    await act(async () => {})
    expect(restoredNotice()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
