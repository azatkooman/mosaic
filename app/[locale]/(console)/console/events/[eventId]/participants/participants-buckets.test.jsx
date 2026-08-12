import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import messages from '@/messages/en.json'

// The table talks to Supabase and the date-prefs context on mount; neither is
// reachable in a unit test, and react-query does not run queryFn during a
// server render, so a bare stub is enough to get the markup out.
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => ({}) }))
// next-intl's createNavigation drags in next/navigation, which Node's ESM
// resolver can't load outside the Next bundler; the table only needs an <a>.
vi.mock('@/lib/i18n/navigation', () => ({ Link: ({ href, children, ...rest }) => <a href={String(href)} {...rest}>{children}</a> }))
vi.mock('@/components/providers/DateFormatProvider', () => ({
  useDateFormatPrefs: () => ({ dateFormat: 'auto', timeFormat: 'auto' }),
}))

const { ParticipantsTable } = await import('./ParticipantsTable')

/**
 * The two single-mode lists must not share an answer column, so the headers of
 * one must never include the other's questions; the All list is their union and
 * must include both. Asserted on the real component so the bucket → columns
 * wiring is exercised, not just lib/event-questions.
 */
const INDIVIDUAL = [
  { id: 'q_solo_diet', type: 'text', label: { en: 'Dietary needs' } },
  { id: 'q_solo_shirt', type: 'select', label: { en: 'Shirt size' }, options: [] },
]
const GROUP = [
  { id: 'q_grp_lead', type: 'text', label: { en: 'Group leader' } },
  { id: 'q_grp_rooms', type: 'number', label: { en: 'Rooms needed' } },
]
const BUCKETS = {
  individual: { questions: INDIVIDUAL, versionIds: ['s2'] },
  group: { questions: GROUP, versionIds: ['f1', 'f3'] },
  // Shaped exactly as eventQuestionBuckets builds it, so the fixture cannot
  // drift into testing a table the producer never renders.
  all: { questions: [...INDIVIDUAL, ...GROUP], versionIds: ['s2', 'f1', 'f3'] },
}

function render(buckets, initialBucket, formTitles, perms = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>
        <ParticipantsTable
          eventId="e1"
          participantTypes={[]}
          buckets={buckets}
          definitionByVersion={{}}
          formTitles={formTitles}
          initialBucket={initialBucket}
          canEdit={perms.canEdit}
          canChangeStatus={perms.canChangeStatus}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>
  )
}

/** Text of every column header, minus the sort-direction glyph SortHeader appends. */
function headers(html) {
  return [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1]
      .replace(/<[^>]*>/g, '')
      .replace(/[↕↑↓]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

describe('participants buckets', () => {
  it('shows the individual columns and none of the group columns', () => {
    const html = render(BUCKETS, 'individual')
    const cols = headers(html)
    expect(cols).toContain('Dietary needs')
    expect(cols).toContain('Shirt size')
    expect(cols).not.toContain('Group leader')
    expect(cols).not.toContain('Rooms needed')
  })

  it('defaults to the merged All view: kind column plus BOTH lists’ columns', () => {
    // The All tab used to render no answer columns at all, on the theory that
    // they were per-form. They are shared far more often than not — a group
    // form is cloned from the single form and keeps its question ids.
    const html = render(BUCKETS)
    const cols = headers(html)
    expect(cols).toContain('Registration')
    expect(cols).toContain('Dietary needs')
    expect(cols).toContain('Shirt size')
    expect(cols).toContain('Group leader')
    expect(cols).toContain('Rooms needed')
  })

  it('qualifies a label the two forms both use, so the columns are tellable apart', () => {
    // tech-conference-2026: the Default and Single response forms each define
    // their own "Email" under a different question id.
    const dup = [
      { id: 'q_a', type: 'email', label: { en: 'Email' } },
      { id: 'q_b', type: 'email', label: { en: 'Email' } },
    ]
    const html = render(
      { ...BUCKETS, all: { questions: dup, versionIds: ['s2', 'f1'] } },
      'all',
      { q_a: 'Default form', q_b: 'Single response form' }
    )
    const cols = headers(html)
    expect(cols).toContain('Email (Default form)')
    expect(cols).toContain('Email (Single response form)')
  })

  it('offers all three tabs when the event runs a group form', () => {
    const html = render(BUCKETS)
    expect(html).toContain('All participants')
    expect(html).toContain('Individual registrations')
    expect(html).toContain('Group registrations')
    expect(html).toContain('role="tablist"')
  })

  it('hides the tab strip when the event has no group form', () => {
    const html = render({ ...BUCKETS, group: { questions: [], versionIds: [] } })
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('Group registrations')
    // The single list still renders its own columns, without a kind column.
    expect(headers(html)).toContain('Dietary needs')
    expect(headers(html)).not.toContain('Registration')
  })

  it('scopes both downloads to the active tab', () => {
    const html = render(BUCKETS, 'group')
    const exports = [...html.matchAll(/href="([^"]*\/api\/export[^"]*)"/g)].map((m) => m[1])
    expect(exports).toHaveLength(2)
    for (const href of exports) expect(href).toContain('bucket=group')
  })

  it('scopes the All download to the merged view', () => {
    const html = render(BUCKETS)
    const exports = [...html.matchAll(/href="([^"]*\/api\/export[^"]*)"/g)].map((m) => m[1])
    expect(exports).toHaveLength(2)
    for (const href of exports) expect(href).toContain('bucket=all')
  })

  it('always offers an Actions column, whatever the viewer may do', () => {
    // It used to disappear entirely for roles that cannot change status, since
    // the status select was all it held. It now also carries each row's own
    // open control — Reg. # was the ONLY way into a registration, and nobody
    // reads a number as "edit this person". There is no name column to hang it
    // on instead: names are ordinary form questions an organizer can remove.
    //
    // Only the header is asserted. react-query does not run queryFn during a
    // server render and this project has no jsdom, so the body is always
    // "Loading…" here and no row-level control can be exercised.
    for (const perms of [{ canEdit: true, canChangeStatus: true }, { canEdit: false, canChangeStatus: false }]) {
      expect(headers(render(BUCKETS, 'individual', undefined, perms))).toContain('Actions')
    }
  })

  it('names the account holder columns for what they mean', () => {
    // "Profile Name"/"Profile Email" did not say that this is whoever performed
    // the registration — on a group booking, the same person on every row.
    const cols = headers(render(BUCKETS, 'individual'))
    expect(cols).toContain('Registered by')
    expect(cols).toContain('Registered by (email)')
    expect(cols).not.toContain('Profile Name')
    expect(cols).not.toContain('Profile Email')
  })
})
