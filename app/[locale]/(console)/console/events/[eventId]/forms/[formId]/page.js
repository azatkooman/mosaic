import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { FormBuilder } from '@/components/form-builder/FormBuilder'
import { eventLocales, localeName } from '@/lib/i18n/locales'

export const dynamic = 'force-dynamic'

export default async function FormBuilderPage({ params }) {
  const { locale, eventId, formId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()

  // Always edit a draft version; create one (cloning current) if none exists.
  const { data: draftId, error } = await supabase.rpc('create_draft_version', {
    p_form_id: formId,
  })
  if (error || !draftId) notFound()

  const [{ data: version }, { data: types }, { data: event }, { data: form }] = await Promise.all([
    supabase.from('form_versions').select('id, version, definition').eq('id', draftId).single(),
    supabase
      .from('participant_types')
      .select('key, name')
      .eq('event_id', eventId)
      .order('sort_order'),
    // `name` for the Forms page tab, which renders the registrant's
    // "Register for {event}" title.
    supabase
      .from('events')
      .select('name, default_locale, supported_locales, page_content')
      .eq('id', eventId)
      .single(),
    // Appearance (0055) rides on the form, not the version: it is not versioned
    // data and changing it must never require publishing.
    supabase.from('forms').select('appearance').eq('id', formId).single(),
  ])
  if (!version) notFound()

  return (
    <FormBuilder
      versionId={version.id}
      versionNumber={version.version}
      initialDefinition={version.definition ?? { questions: [] }}
      participantTypes={types ?? []}
      eventName={event?.name ?? {}}
      formId={formId}
      initialAppearance={form?.appearance ?? {}}
      /* What an unset appearance falls back to, so a form nobody has
         customized already looks like the event it belongs to. */
      eventTheme={event?.page_content?.theme ?? {}}
      defaultLocale={event?.default_locale ?? 'en'}
      supportedLocales={eventLocales(event)}
      localeNames={Object.fromEntries(
        eventLocales(event).map((code) => [code, localeName(event, code)])
      )}
    />
  )
}
