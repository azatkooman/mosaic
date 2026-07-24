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

  const [{ data: version }, { data: types }, { data: event }] = await Promise.all([
    supabase.from('form_versions').select('id, version, definition').eq('id', draftId).single(),
    supabase
      .from('participant_types')
      .select('key, name')
      .eq('event_id', eventId)
      .order('sort_order'),
    supabase.from('events').select('default_locale, supported_locales, page_content').eq('id', eventId).single(),
  ])
  if (!version) notFound()

  return (
    <FormBuilder
      versionId={version.id}
      versionNumber={version.version}
      initialDefinition={version.definition ?? { questions: [] }}
      participantTypes={types ?? []}
      defaultLocale={event?.default_locale ?? 'en'}
      supportedLocales={eventLocales(event)}
      localeNames={Object.fromEntries(
        eventLocales(event).map((code) => [code, localeName(event, code)])
      )}
    />
  )
}
