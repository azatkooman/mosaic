# Multi-language events — changes

End-to-end support for offering an event (its page **and** its registration
forms) in the organizer's chosen languages: pick languages, author in English,
auto-translate, review, and publish in every selected language for the life of
the event.

## The organizer flow

1. In **Settings**, pick the event's languages: English (the default/source)
   plus any others from a searchable list of Google-Translate-supported
   languages (e.g. Tajik, Yoruba, Kazakh).
2. Author all content in **English** first — on the Event Page editor and in
   the form builder.
3. **Auto-translate** fills every selected language (empty slots only, never
   overwriting your edits).
4. **Review and edit** each language via the per-language tabs.
5. The public **event page** and **registration forms** are available in all
   selected languages until the event ends.

> Note: for languages beyond the five built-ins (en/es/fr/ru/uk), only the
> organizer's **content** is translated. Fixed platform UI (buttons, nav,
> validation) stays in the default language — translating the platform chrome
> into 100+ languages is out of scope.

## Changes by area

### Language list (sourced from Google, not hardcoded)
- `lib/i18n/translate-languages.js` — `getTranslateLanguages()` fetches
  Google's `languages` endpoint, **cached 24h**, with a fallback to the
  built-in locales when the API key is missing or the request fails. No
  hand-maintained language list.
- `app/api/translate-languages/route.js` — auth-gated route serving the list
  to the Settings picker.

### Language selection (event Settings)
- Built-in languages via a checklist + default-language selector.
- Custom languages added via a **searchable picker** over the Google list;
  each uses its **real Google code** (`tg`, `yo`) so it can be auto-translated.
  Excludes built-ins and already-added languages.
- Persisted to `page_content.i18n` (`available` + `custom`), the shared source
  of truth read by every surface via `eventLocales()`.

### Auto-translate
- `app/api/translate-event/route.js` and `app/api/translate-form/route.js` gate
  against the **full Google-supported set** (fetched + cached) instead of a
  hardcoded five, so **custom languages translate too**.
- `lib/form-localization.js` — `isLocaleMap` / `collectLocalizedStrings` /
  `applyLocalizedTranslations` take an optional `codes` set, so locale maps
  containing a custom code (`{en, tg}`) are recognized and translated rather
  than skipped. Covered by a unit test.
- Event page: existing "Auto-translate content" action.
- Form builder: translates the selected language on tab switch (fills empty
  slots), reviewed via the per-question language tabs; changes autosave.

### Public rendering
- `components/event-page/EventPageView.jsx` — the language switcher shows every
  language as an **acronym** (e.g. `EN`, `PT`), custom and built-in alike.
  Built-in languages use their locale route; custom languages ride the current
  route via `?lang=`.
- `app/[locale]/(event)/events/[slug]/register/page.js` — the registration page
  now offers **all** selected languages (not just built-ins). It resolves a
  `contentLocale` from `?lang=` (honored only for a real custom language the
  event offers) else the route locale, and renders the switcher the same way as
  the event page.
- `components/wizard/RegistrationWizard.jsx` — renders participant-type names
  and form questions against `contentLocale`, and stores the registration's
  `locale` accordingly. Platform chrome stays on the route locale.

## Data model
- No schema migration required. Custom languages live entirely in
  `events.page_content.i18n` (`available` + `custom`); built-ins stay in
  `supported_locales` / `default_locale`.
- `registrations.locale` is plain text, so a custom code (e.g. `tg`) persists
  fine when someone registers in a custom language.

## Operational follow-ups
- **Deployed DB migration history** — a few migrations were applied by hand to
  reconcile earlier drift (`page_content`, `creator_published`). Worth a proper
  `supabase migration repair` pass so future `db push` stays clean.
- **Google API key** — auto-translate and the custom-language picker require
  `GOOGLE_TRANSLATE_API_KEY`. Without it, the picker falls back to the built-in
  languages only.
