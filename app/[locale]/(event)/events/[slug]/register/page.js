import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link, redirect } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt, eventLocales, localeAcronym } from '@/lib/i18n/locales'
import { RegistrationWizard } from '@/components/wizard/RegistrationWizard'
import { LanguagePicker } from '@/components/ui'
import { eventPageUrl } from '@/lib/url'

export const dynamic = 'force-dynamic'

export default async function RegisterPage({ params, searchParams }) {
  const { slug, locale } = await params
  const { lang } = (await searchParams) ?? {}
  setRequestLocale(locale)
  const t = await getTranslations('wizard')
  const tCommon = await getTranslations('common')

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // Keep the reader's language across the login round-trip, or they come
    // back to an English form.
    const next = eventPageUrl({ slug, code: lang, uiLocale: locale, subPath: '/register' })
    redirect({ href: `/login?next=${encodeURIComponent(next)}`, locale })
  }

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (!event) notFound()

  // Languages this event is offered in (built-in + organizer-defined custom).
  // Built-in languages switch via their own locale route; custom languages ride
  // the current route with ?lang=. contentLocale is the language the form and
  // content render in — honoring ?lang= only for a real custom language.
  const customCodes = (
    Array.isArray(event.page_content?.i18n?.custom) ? event.page_content.i18n.custom : []
  ).map((c) => c.code)
  const localeOptions = eventLocales(event)
  const contentLocale =
    lang && customCodes.includes(lang) && localeOptions.includes(lang) ? lang : locale

  // One registration per account per event (the submit RPC enforces this
  // authoritatively) — send returning registrants to their registration
  // instead of the wizard.
  const [{ data: existing }, { data: globalRoles }, { data: teamRoles }, { data: profile }] =
    await Promise.all([
      supabase
        .from('registrations')
        .select('id, participants ( status )')
        .eq('event_id', event.id)
        .eq('registered_by', user.id),
      supabase.from('user_roles').select('role').eq('user_id', user.id),
      supabase
        .from('event_organizers')
        .select('status, event_roles:role_id ( can_add_registrants )')
        .eq('event_id', event.id)
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle(),
    ])
  // Mirrors the RPC's exemption: registrars (add-registrants privilege or a
  // global role) may submit multiple registrations on behalf of others.
  const isRegistrar =
    (globalRoles?.length ?? 0) > 0 ||
    (teamRoles ?? []).some((m) => m.status === 'active' && m.event_roles?.can_add_registrants)
  const alreadyRegistered =
    !isRegistrar &&
    (existing ?? []).some((r) =>
      (r.participants ?? []).some((p) => p.status !== 'cancelled')
    )
  if (alreadyRegistered) {
    return (
      <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
        <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
          {t('title', { event: lt(event.name, contentLocale, event.default_locale) })}
        </h1>
        <p className="alert alert-info">{t('alreadyRegistered')}</p>
        <Link href="/my/registrations" className="btn btn-primary">
          {t('viewMyRegistrations')}
        </Link>
      </div>
    )
  }

  const { data: types } = await supabase
    .from('participant_types')
    .select('id, key, name, capacity, min_per_registration, max_per_registration, sort_order, form_id, forms:form_id ( current_version_id )')
    .eq('event_id', event.id)
    .order('sort_order')
  if (!types?.length) notFound()

  // Mode-scoped forms (single/family) override the per-type form when the
  // respondent picks that registration mode.
  const { data: modeFormRows } = await supabase
    .from('forms')
    .select('registration_mode, current_version_id')
    .eq('event_id', event.id)
    .not('registration_mode', 'is', null)

  const versionIds = [
    ...new Set(
      [
        ...types.map((pt) => pt.forms?.current_version_id),
        ...(modeFormRows ?? []).map((f) => f.current_version_id),
      ].filter(Boolean)
    ),
  ]
  const { data: versions } = await supabase
    .from('form_versions')
    .select('id, definition')
    .in('id', versionIds)
  const defById = new Map((versions ?? []).map((v) => [v.id, v.definition]))

  const modeForms = {}
  for (const f of modeFormRows ?? []) {
    if (f.current_version_id && defById.has(f.current_version_id)) {
      modeForms[f.registration_mode] = defById.get(f.current_version_id)
    }
  }

  // A type is registerable if its own form is published, or if any published
  // mode form can stand in for it.
  const hasModeForms = Object.keys(modeForms).length > 0
  const participantTypes = types
    .filter((pt) => pt.forms?.current_version_id || hasModeForms)
    .map((pt) => ({
      key: pt.key,
      name: pt.name,
      max_per_registration: pt.max_per_registration,
      definition: pt.forms?.current_version_id
        ? defById.get(pt.forms.current_version_id) ?? { questions: [] }
        : null,
    }))

  return (
    <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s-3)' }}>
        <LanguagePicker
          options={localeOptions.map((code) => ({
            value: code,
            // Short code here too, matching the event page an attendee just
            // came from; the console keeps full names.
            label: localeAcronym(code),
            // Built-in locales have their own route; custom codes ride the
            // current route via ?lang=.
            href: eventPageUrl({ slug, code, uiLocale: locale, subPath: '/register' }),
          }))}
          value={contentLocale}
          ariaLabel={tCommon('language')}
        />
      </div>
      <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
        {t('title', { event: lt(event.name, contentLocale, event.default_locale) })}
      </h1>
      <RegistrationWizard
        event={event}
        participantTypes={participantTypes}
        modeForms={modeForms}
        userId={user.id}
        profile={profile}
        contentLocale={contentLocale}
      />
    </div>
  )
}
