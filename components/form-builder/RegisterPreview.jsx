'use client'

import { NextIntlClientProvider, useTranslations } from 'next-intl'
import enMessages from '@/messages/en.json'
import esMessages from '@/messages/es.json'
import frMessages from '@/messages/fr.json'
import ruMessages from '@/messages/ru.json'
import ukMessages from '@/messages/uk.json'
import { LOCALES, lt, localeAcronym } from '@/lib/i18n/locales'
import {
  appearanceVars,
  formSurfaceStyle,
  headerBand,
  introStyle,
  introTextFor,
  progressStyle,
  questionVars,
  showsBackLink,
  showsLanguagePicker,
  showsProgress,
  titleStyle,
} from '@/lib/form-appearance'
import { Button, LanguagePicker } from '@/components/ui'
import { FormRenderer } from '@/components/form-runtime/FormRenderer'
import wizardStyles from '@/components/wizard/wizard.module.css'
import styles from './builder.module.css'

// Same trick as the event page editor: the register screen is rendered in the
// language being previewed, not the console's own, so an organizer checking the
// Russian form sees Russian buttons around it.
const PREVIEW_MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  ru: ruMessages,
  uk: ukMessages,
}

/**
 * The register screen as a registrant sees it — the "Forms page" tab.
 *
 * This is a replica of `app/[locale]/(event)/events/[slug]/register/page.js` at
 * its person step: the step that actually shows the form this builder edits,
 * wrapped in the chrome that surrounds it (the back link, the language picker,
 * "Register for…", "Participant 1 of 1", Back/Next).
 *
 * A replica, and not the real `RegistrationWizard`, because the wizard is not
 * the thing being previewed. Half this screen — the title, the back link, the
 * language picker — is built by the register *page*, outside the wizard
 * entirely; and the wizard itself owns a step machine, localStorage drafts,
 * validation and a submit that posts to /api/register, none of which can run
 * against a draft version with no event row and no registrant. Mounting it
 * would mean threading an inert mode through all of that to arrive at the same
 * markup this file writes directly.
 *
 * What fidelity there is comes from shared code rather than from care: the
 * layout classes (`container-narrow`, `page-title`, `eyebrow`) are the global
 * ones the register page uses, the panel and nav rules are imported from the
 * wizard's own stylesheet, and the form is the same `FormRenderer` component
 * the wizard renders. Only the arrangement is restated here — so a change to
 * how a question looks reaches this tab on its own, and a change to the wizard's
 * step layout does not.
 *
 * The chrome controls are deliberately inert: nothing here navigates, and the
 * language picker does not switch languages (the previewed language follows the
 * builder's own language control on the Questions tab). The form fields stay
 * live, so the organizer can still type into their form and watch conditional
 * questions appear.
 */
export function RegisterPreview({
  definition,
  eventName,
  participantTypes,
  participantTypeKey,
  locale,
  defaultLocale,
  supportedLocales,
  localeNames,
  answers,
  onAnswerChange,
  resolved,
  onEditZone,
  headerImageUrl,
}) {
  // Platform text only exists in the five platform locales. A custom language
  // gets its chrome at runtime from the cached machine translations in
  // `ui_translations`, which the builder has no access to — so it falls back to
  // the event's own language here, which is also what the register page does
  // whenever that cache is empty.
  const uiLocale = LOCALES.includes(locale)
    ? locale
    : LOCALES.includes(defaultLocale)
      ? defaultLocale
      : 'en'

  return (
    <NextIntlClientProvider
      locale={uiLocale}
      messages={PREVIEW_MESSAGES[uiLocale] ?? PREVIEW_MESSAGES.en}
    >
      <RegisterPreviewBody
        definition={definition}
        eventName={eventName}
        participantTypes={participantTypes}
        participantTypeKey={participantTypeKey}
        locale={locale}
        defaultLocale={defaultLocale}
        supportedLocales={supportedLocales}
        localeNames={localeNames}
        answers={answers}
        onAnswerChange={onAnswerChange}
        resolved={resolved}
        onEditZone={onEditZone}
        headerImageUrl={headerImageUrl}
      />
    </NextIntlClientProvider>
  )
}

function RegisterPreviewBody({
  definition,
  eventName,
  participantTypes,
  participantTypeKey,
  locale,
  defaultLocale,
  supportedLocales,
  localeNames,
  answers,
  onAnswerChange,
  resolved,
  onEditZone,
  headerImageUrl,
}) {
  const t = useTranslations('wizard')
  const tCommon = useTranslations('common')
  const tConsole = useTranslations('console')

  const type = participantTypes.find((pt) => pt.key === participantTypeKey)
  const typeName = type ? lt(type.name, locale, defaultLocale) || type.key : ''
  const intro = introTextFor(resolved, locale, defaultLocale)

  // A pencil in the corner rather than a clickable zone. Making the zone itself
  // the control would nest the form's own inputs inside an interactive element,
  // which is invalid and unusable with a keyboard; a real button beside it is
  // neither. Absent entirely when the preview is not being customized.
  const edit = (zone, label) =>
    onEditZone ? (
      <button
        type="button"
        className={styles.zoneEdit}
        onClick={() => onEditZone(zone)}
        aria-label={`${tConsole('formCustomize')}: ${label}`}
        title={label}
      >
        ✎
      </button>
    ) : null

  const band = headerBand(resolved, headerImageUrl)

  return (
    // The theme rides here, on the same element that holds the page's own
    // width, so `--container-narrow` is in scope for the class that reads it.
    <div
      className="container-narrow"
      style={{
        paddingBlock: 'var(--s-6)',
        ...appearanceVars(resolved),
        ...formSurfaceStyle(resolved),
      }}
    >
      {/* The register page's own header zone, rule for rule — the controls and
          the title together, because the title is inside the band and takes the
          backdrop's colour with everything else in there. */}
      <div className={styles.zone}>
        {edit('header', tConsole('formZone_header'))}
        <div className="form-header" data-backdrop={band.hasBackdrop || undefined} style={band.style}>
          {band.hasImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase
                  storage URL for an image whose size the organizer controls;
                  next/image would need the bucket host in remotePatterns and
                  bills per optimization for no benefit at this size. */}
              <img src={headerImageUrl} alt="" className="form-header-bg" />
              <div className="form-header-scrim" style={band.overlayStyle} />
            </>
          )}
          <div className="form-header-content">
            <div className="form-header-row">
              {/* The real page renders this as an <a>; a button with nothing
                  behind it is the same thing minus the navigation. Built from
                  the shared Button either way, so the two can never diverge
                  visually. */}
              {showsBackLink(resolved) ? (
                <Button variant="shell" size="sm" className={styles.inert}>
                  <span aria-hidden="true">&larr;</span> {t('backToEvent')}
                </Button>
              ) : (
                <span />
              )}
              {/* No `href` and no `onChange`, so choosing a language does
                  nothing and the select snaps back to the previewed one.
                  Renders nothing at all when the event is offered in a single
                  language — which is what the register page does too, and the
                  reason this is the real component rather than a drawn-on
                  lookalike. */}
              {showsLanguagePicker(resolved) && (
                <LanguagePicker
                  variant="shell"
                  options={supportedLocales.map((code) => ({
                    value: code,
                    // Short codes here, matching the event page an attendee
                    // just came from; the console's own pickers keep full names.
                    label: localeAcronym(code),
                  }))}
                  value={locale}
                  ariaLabel={tCommon('language')}
                />
              )}
            </div>
            <h1 className="page-title" style={titleStyle(resolved)}>
              {t('title', { event: lt(eventName, locale, defaultLocale) })}
            </h1>
          </div>
        </div>
      </div>

      {(intro || onEditZone) && (
        <div className={styles.zone}>
          {edit('intro', tConsole('formZone_intro'))}
          {intro ? (
            <p className={styles.introText} style={introStyle(resolved)}>
              {intro}
            </p>
          ) : (
            <p className={styles.introEmpty}>{tConsole('showIntro')}</p>
          )}
        </div>
      )}

      <div className={wizardStyles.panel}>
        {/* One participant, because a preview has no counts step to have
            answered — a real registration reads "Participant 2 of 4" here. */}
        {showsProgress(resolved) && (
          <p className="eyebrow" style={progressStyle(resolved)}>
            {t('participantOf', { index: 1, total: 1 })}
            {typeName ? ` · ${typeName}` : ''}
          </p>
        )}
        <div className={styles.zone}>
          {edit('questions', tConsole('formZone_questions'))}
          <FormRenderer
            definition={definition}
            participantTypeKey={participantTypeKey}
            locale={locale}
            defaultLocale={defaultLocale}
            answers={answers}
            onChange={onAnswerChange}
            preview
            questionVars={(q) => questionVars(resolved, q)}
          />
        </div>
        <div className={styles.zone}>
          {edit('nav', tConsole('formZone_nav'))}
          <div className={wizardStyles.nav}>
            <Button variant="ghost" className={styles.inert}>
              {tCommon('back')}
            </Button>
            <Button className={styles.inert}>{tCommon('next')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
