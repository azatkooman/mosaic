'use client'

import { useState } from 'react'
import { EventPageView } from '@/components/event-page/EventPageView'

/**
 * The event page as attendees saw it, with a working language switcher that
 * does not leave the admin console.
 *
 * The only reason this is a client component: `contentLocale` has to be state
 * so the hero's switcher can swap languages in place. Everything it renders is
 * the real EventPageView, so what an admin reads is exactly what was published
 * — including any hand-edits the organizer made after auto-translating, since
 * this only re-resolves the SAVED text for the chosen language and never
 * translates anything.
 */
export function ReadOnlyEventPage({ event, locale }) {
  const [contentLocale, setContentLocale] = useState(event.default_locale)

  return (
    <EventPageView
      event={event}
      locale={locale}
      contentLocale={contentLocale}
      // Read, don't use: no edit pencils (editable stays false) and no chrome
      // that navigates away from the admin console.
      navigable={false}
      onContentLocaleChange={setContentLocale}
    />
  )
}
