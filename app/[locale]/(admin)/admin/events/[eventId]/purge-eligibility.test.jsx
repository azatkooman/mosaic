import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = Date.parse('2026-06-01T12:00:00Z')
const iso = (offset) => new Date(NOW + offset).toISOString()

// The overview is an async server component: call it, then read the props it
// hands the purge button, which is the only consumer of the date rule.
let event = null
const query = (data) => {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    not: () => q,
    maybeSingle: () => Promise.resolve({ data }),
    then: (resolve) => Promise.resolve({ data: Array.isArray(data) ? data : [] }).then(resolve),
  }
  return q
}
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ from: (table) => query(table === 'events' ? event : []) }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key) => key,
  setRequestLocale: () => {},
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))
vi.mock('./PurgeEventButton', () => ({ PurgeEventButton: () => null }))

const { default: AdminEventOverview } = await import('./page')
const { PurgeEventButton } = await import('./PurgeEventButton')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

function findProps(node, type) {
  if (!node || typeof node !== 'object') return null
  if (node.type === type) return node.props
  const kids = node.props?.children
  for (const child of Array.isArray(kids) ? kids.flat(Infinity) : [kids]) {
    const hit = findProps(child, type)
    if (hit) return hit
  }
  return null
}

async function eligible(fields) {
  event = { id: 'e1', name: { en: 'Camp' }, default_locale: 'en', ends_at: null, deleted_at: null, ...fields }
  const tree = await AdminEventOverview({ params: Promise.resolve({ locale: 'en', eventId: 'e1' }) })
  return findProps(tree, PurgeEventButton).eligible
}

describe('admin event overview purge eligibility', () => {
  it('allows purging an archived event at any time', async () => {
    expect(await eligible({ deleted_at: iso(-1000), ends_at: iso(86_400_000) })).toBe(true)
  })

  it('allows purging a live event once it has ended', async () => {
    expect(await eligible({ ends_at: iso(-1) })).toBe(true)
  })

  it('refuses a live event that has not ended, including at the very end instant', async () => {
    expect(await eligible({ ends_at: iso(86_400_000) })).toBe(false)
    expect(await eligible({ ends_at: iso(0) })).toBe(false)
  })

  it('refuses a live event with no end date', async () => {
    expect(await eligible({})).toBe(false)
  })
})
