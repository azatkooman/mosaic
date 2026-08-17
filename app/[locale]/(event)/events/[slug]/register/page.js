import { notFound } from 'next/navigation'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { Link, redirect } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt, eventLocales, localeAcronym } from '@/lib/i18n/locales'
import { getContentMessages } from '@/lib/i18n/ui-messages-server'
import { RegistrationWizard } from '@/components/wizard/RegistrationWizard'
import { LanguagePicker } from '@/components/ui'
import { eventPageUrl } from '@/lib/url'
import { eventMediaUrl } from '@/lib/storage'
import { resolvePreselectedType, visibleParticipantTypes } from '@/lib/participant-types'
import {
  appearanceVars,
  formSurfaceStyle,
  screenBackgroundStyle,
  headerBand,
  introStyle,
  introTextFor,
  resolveFormAppearance,
  showsBackLink,
  showsLanguagePicker,
  titleStyle,
} from '@/lib/form-appearance'

export const dynamic = 'force-dynamic'

export default async function RegisterPage({ params, searchParams }) {
  const { slug, locale } = await params
  const { lang, type: typeParam } = (await searchParams) ?? {}
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // Keep the reader's language across the login round-trip, or they come
    // back to an English form.
    const next = eventPageUrl({
      slug, code: lang, uiLocale: locale, subPath: '/register',
      // Or a staff member who signs in from their private link lands on
      // the ordinary form with the type they were sent for missing.
      params: { type: typeParam },
    })
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

  // The wizard's own text — "Register for…", "Single registration", "Next",
  // "First name", the validation errors — is platform text, not event content,
  // so it lives in messages/{locale}.json and only exists in the five platform
  // locales. A custom language has no route to carry it (it rides ?lang=), so
  // the chrome stayed in the route locale while everything around it was
  // translated. These are the cached machine translations for that language,
  // laid over the route locale's catalog; `changed` is false for a platform
  // locale, which already resolves correctly, and whenever the cache is empty.
  // See lib/i18n/ui-messages.js.
  const { messages: contentMessages, changed: hasContentMessages } =
    await getContentMessages(contentLocale)
  // createTranslator, not getTranslations: the latter reads the request's own
  // catalog and cannot be handed a merged one. Formatting stays on `locale` —
  // a real platform locale — because some Google language codes are not valid
  // Intl locales and must never reach a date formatter.
  const t = createTranslator({ locale, messages: contentMessages, namespace: 'wizard' })
  const tCommon = createTranslator({ locale, messages: contentMessages, namespace: 'common' })

  // Back to the event page in the language the reader is already in. A plain
  // <a>, not next-intl's Link: eventPageUrl already carries the locale prefix
  // (and a ?lang= for custom languages), which Link would prefix a second time.
  const eventHref = eventPageUrl({ slug, code: contentLocale, uiLocale: locale })
  // Takes its variant because the same link is drawn on two different surfaces.
  // In the header zone it is always `shell` — the translucent pill holds up over
  // a photo, a brand colour, or a page background set to black, and a `ghost`
  // link disappears into any of the three.
  const backLink = (variant) => (
    <a href={eventHref} className={`btn btn-${variant} btn-sm`}>
      <span aria-hidden="true">&larr;</span> {t('backToEvent')}
    </a>
  )
  // The early returns below are the closed / already-registered / no-types
  // screens. They render before any form's appearance is known and apply none
  // of it, so they sit on the platform's own background where `ghost` is right.
  const backToEvent = backLink('ghost')

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
  // The organizer's manual switch. submit_registration rejects these anyway,
  // but a wizard that only fails at the last step is a waste of the
  // registrant's time.
  if (event.registration_manually_closed) {
    return (
      <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
        <div style={{ marginBottom: 'var(--s-3)' }}>{backToEvent}</div>
        <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
          {t('title', { event: lt(event.name, contentLocale, event.default_locale) })}
        </h1>
        <p className="alert alert-info">{t('registrationClosed')}</p>
      </div>
    )
  }

  if (alreadyRegistered) {
    return (
      <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
        <div style={{ marginBottom: 'var(--s-3)' }}>{backToEvent}</div>
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
    .select('id, key, name, capacity, hidden, min_per_registration, max_per_registration, sort_order, form_id, forms:form_id ( current_version_id, appearance )')
    .eq('event_id', event.id)
    .order('sort_order')
  if (!types?.length) notFound()

  // Mode-scoped forms (single/family) override the per-type form when the
  // respondent picks that registration mode.
  const { data: modeFormRows } = await supabase
    .from('forms')
    .select('registration_mode, current_version_id, appearance')
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
  // Appearance (0055) is per FORM, so it follows the same override order the
  // definitions do: a mode form's look wins over the participant type's for
  // exactly the registrations that mode form covers. Kept as its own map rather
  // than folded into modeForms, whose values are definitions everywhere they
  // are read.
  const modeAppearance = {}
  for (const f of modeFormRows ?? []) {
    if (f.current_version_id && defById.has(f.current_version_id)) {
      modeForms[f.registration_mode] = defById.get(f.current_version_id)
      modeAppearance[f.registration_mode] = f.appearance ?? {}
    }
  }

  // A type is registerable if its own form is published, or if any published
  // mode form can stand in for it.
  const hasModeForms = Object.keys(modeForms).length > 0
  const participantTypes = types
    .filter((pt) => pt.forms?.current_version_id || hasModeForms)
    .map((pt) => ({
      id: pt.id,
      key: pt.key,
      name: pt.name,
      hidden: Boolean(pt.hidden),
      min_per_registration: pt.min_per_registration,
      max_per_registration: pt.max_per_registration,
      definition: pt.forms?.current_version_id
        ? defById.get(pt.forms.current_version_id) ?? { questions: [] }
        : null,
      appearance: pt.forms?.appearance ?? {},
    }))

  // Resolve the deep link against types that are actually registerable, then
  // drop hidden types from the list — except the one being linked to, which is
  // the whole reason to hide a type in the first place.
  const preselectedTypeKey = resolvePreselectedType(participantTypes, typeParam)
  const offeredTypes = visibleParticipantTypes(participantTypes, preselectedTypeKey)

  // Every type hidden and no link to any of them: an empty wizard would render
  // a mode step with nothing to pick.
  if (offeredTypes.length === 0) {
    return (
      <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
        <div style={{ marginBottom: 'var(--s-3)' }}>{backToEvent}</div>
        <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
          {t('title', { event: lt(event.name, contentLocale, event.default_locale) })}
        </h1>
        <p className="alert alert-info">{t('noTypesAvailable')}</p>
      </div>
    )
  }

  // The wizard and the form runtime call useTranslations in ~30 places. Nesting
  // a provider swaps the catalog for that whole subtree without touching any of
  // them: IntlProvider inherits everything but `messages` from the surrounding
  // context, so locale, time zone and formatters stay exactly as the root layout
  // set them. Skipped when there is nothing to override, so a platform locale
  // keeps the single provider it has always had.
  const wizardElement = (
    <RegistrationWizard
      event={event}
      participantTypes={offeredTypes}
      preselectedTypeKey={preselectedTypeKey}
      modeForms={modeForms}
      modeAppearance={modeAppearance}
      eventTheme={event.page_content?.theme ?? {}}
      userId={user.id}
      profile={profile}
      contentLocale={contentLocale}
    />
  )
  const wizard = hasContentMessages ? (
    <NextIntlClientProvider locale={locale} messages={contentMessages}>
      {wizardElement}
    </NextIntlClientProvider>
  ) : (
    wizardElement
  )

  // The shell — title, back link, language picker — is drawn before the reader
  // has chosen anything, so it takes the look of the form they will land on:
  // the one their ?type= link names, otherwise the first type on offer. Once a
  // mode or type IS chosen the wizard re-applies that form's own variables over
  // these, which is what makes "the group form can look different" true rather
  // than only true below the title.
  const shellAppearance =
    (preselectedTypeKey
      ? offeredTypes.find((pt) => pt.key === preselectedTypeKey)?.appearance
      : null) ??
    offeredTypes[0]?.appearance ??
    {}
  const shell = resolveFormAppearance(shellAppearance, event.page_content?.theme)
  const intro = introTextFor(shell, contentLocale, event.default_locale)
  // Either the organizer's own upload or the event's cover, depending on which
  // the panel wrote — both land in the same key as a storage path, so there is
  // nothing to branch on here.
  const headerImageUrl = eventMediaUrl(shell.header?.bg_image_path)
  const band = headerBand(shell, headerImageUrl)

  return (
    // The screen the form sits ON. Mirrors RegisterPreview, which draws the
    // same layer from the same helper — see .form-screen for why only this one
    // carries the class.
    <div className="form-screen" data-viewport style={screenBackgroundStyle(shell)}>
      <div
        className="container-narrow"
        style={{
          paddingBlock: 'var(--s-6)',
          ...appearanceVars(shell),
          ...formSurfaceStyle(shell),
        }}
      >
        {/* The header zone: controls and title together, over whatever backdrop
            the organizer gave it. Mirrored in RegisterPreview — same classes,
            same order, same helper deciding all of it. */}
        <div className="form-header" data-backdrop={band.hasBackdrop || undefined} style={band.style}>
          {band.hasImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- see the
                  matching note in RegisterPreview: a Supabase storage URL that
                  next/image would need remotePatterns for and bill to optimize. */}
              <img src={headerImageUrl} alt="" className="form-header-bg" />
              <div className="form-header-scrim" style={band.overlayStyle} />
            </>
          )}
          <div className="form-header-content">
            <div className="form-header-row">
              {showsBackLink(shell) ? backLink('shell') : <span />}
              <LanguagePicker
                variant="shell"
                options={showsLanguagePicker(shell) ? localeOptions.map((code) => ({
                  value: code,
                  // Short code here too, matching the event page an attendee just
                  // came from; the console keeps full names.
                  label: localeAcronym(code),
                  // Built-in locales have their own route; custom codes ride the
                  // current route via ?lang=.
                  href: eventPageUrl({
                    slug, code, uiLocale: locale, subPath: '/register',
                    params: { type: typeParam },
                  }),
                })) : []}
                value={contentLocale}
                ariaLabel={tCommon('language')}
              />
            </div>
            <h1 className="page-title" style={titleStyle(shell)}>
              {t('title', { event: lt(event.name, contentLocale, event.default_locale) })}
            </h1>
          </div>
        </div>
        {intro && (
          <p style={{ marginBottom: 'var(--s-5)', whiteSpace: 'pre-wrap', ...introStyle(shell) }}>
            {intro}
          </p>
        )}
        {wizard}
      </div>
    </div>
  )
}
