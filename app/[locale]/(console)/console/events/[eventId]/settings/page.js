import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { LOCALES } from '@/lib/i18n/locales'
import { EventSettingsForm } from './EventSettingsForm'

export const dynamic = 'force-dynamic'

export default async function EventSettingsPage({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const [{ data: event }, { data: types }, { data: forms }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
    supabase
      .from('participant_types')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order'),
    supabase.from('forms').select('id, title').eq('event_id', eventId),
  ])
  if (!event) notFound()

  // "New type" in every platform language, so a newly added participant type is
  // seeded with wording that actually matches the key it is stored under.
  //
  // The form used to write `{ [default_locale]: t('newTypeDefault') }`, where
  // t() renders in the CONSOLE locale — a Spanish console on an English-default
  // event stored Spanish text under `en`. Harmless while nothing read it, but it
  // becomes the source text once participant types are auto-translated, so every
  // other language would be translated from the wrong string.
  //
  // Resolved here rather than in the form because the form is a client component
  // and would otherwise have to bundle all five catalogs to reach five words.
  // The full set is passed, not just the current default, so changing the
  // default language and adding a type before saving still seeds correctly.
  const newTypeLabels = Object.fromEntries(
    await Promise.all(
      LOCALES.map(async (l) => [
        l,
        (await getTranslations({ locale: l, namespace: 'console' }))('newTypeDefault'),
      ])
    )
  )

  return (
    <EventSettingsForm
      event={event}
      initialTypes={types ?? []}
      forms={forms ?? []}
      newTypeLabels={newTypeLabels}
    />
  )
}
