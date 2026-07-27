import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import messages from '@/messages/en.json'

// The table talks to Supabase and the date-prefs context on mount; neither is
// reachable in a unit test, and react-query does not run queryFn during a
// server render, so a bare stub is enough to get the markup out.
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => ({}) }))
vi.mock('@/components/providers/DateFormatProvider', () => ({
  useDateFormatPrefs: () => ({ dateFormat: 'auto', timeFormat: 'auto' }),
}))

const { ParticipantsTable } = await import('./ParticipantsTable')

/**
 * Individual and group registrations are listed separately and must not share
 * an answer column, so the headers of one must never include the other's
 * questions. Asserted on the real component so the bucket → columns wiring is
 * exercised, not just lib/event-questions.
 */
const BUCKETS = {
  individual: {
    questions: [
      { id: 'q_solo_diet', type: 'text', label: { en: 'Dietary needs' } },
      { id: 'q_solo_shirt', type: 'select', label: { en: 'Shirt size' }, options: [] },
    ],
    versionIds: ['s2'],
  },
  group: {
    questions: [
      { id: 'q_grp_lead', type: 'text', label: { en: 'Group leader' } },
      { id: 'q_grp_rooms', type: 'number', label: { en: 'Rooms needed' } },
    ],
    versionIds: ['f1', 'f3'],
  },
}

function render(buckets) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>
        <ParticipantsTable
          eventId="e1"
          participantTypes={[]}
          buckets={buckets}
          definitionByVersion={{}}
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
    const html = render(BUCKETS)
    const cols = headers(html)
    expect(cols).toContain('Dietary needs')
    expect(cols).toContain('Shirt size')
    expect(cols).not.toContain('Group leader')
    expect(cols).not.toContain('Rooms needed')
  })

  it('offers both tabs when the event runs a group form', () => {
    const html = render(BUCKETS)
    expect(html).toContain('Individual registrations')
    expect(html).toContain('Group registrations')
    expect(html).toContain('role="tablist"')
  })

  it('hides the tab strip when the event has no group form', () => {
    const html = render({ ...BUCKETS, group: { questions: [], versionIds: [] } })
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('Group registrations')
    // The single list still renders its own columns.
    expect(headers(html)).toContain('Dietary needs')
  })

  it('scopes both downloads to the active tab', () => {
    const html = render(BUCKETS)
    const exports = [...html.matchAll(/href="([^"]*\/api\/export[^"]*)"/g)].map((m) => m[1])
    expect(exports).toHaveLength(2)
    for (const href of exports) expect(href).toContain('bucket=individual')
  })
})
