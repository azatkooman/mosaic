'use client'

import { useState, useEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { LOCALES, LOCALE_NAMES, eventLocales, localeName } from '@/lib/i18n/locales'
import { stripLocales } from '@/lib/form-localization'
import { toLocalInput, fromLocalInput } from '@/lib/dates'
import { PARTICIPANT_TYPE_PRESETS, uniqueTypeKey } from '@/lib/participant-type-presets'
import {
  Button,
  ConfettiBurst,
  Dialog,
  Field,
  Input,
  PreferenceDateInput,
  NativeSelect,
} from '@/components/ui'
import styles from './settings.module.css'

function newContactId() {
  return Math.random().toString(36).slice(2, 10)
}

export function EventSettingsForm({ event, initialTypes, forms }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  // Every language this event is offered in, in display order: [{ code, name }].
  // Platform built-ins and organizer-picked languages share one list — you add
  // them all the same way, and the Default Language dropdown offers exactly
  // these. Their per-language content is authored on the Event Page and
  // form-builder tabs.
  const [langs, setLangs] = useState(() =>
    eventLocales(event).map((code) => ({ code, name: localeName(event, code) }))
  )
  const [defaultLocale, setDefaultLocale] = useState(event.default_locale ?? 'en')
  // Add-language picker: search over the Google-supported languages.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [langQuery, setLangQuery] = useState('')
  const [allLanguages, setAllLanguages] = useState([])
  const [slug, setSlug] = useState(event.slug)
  const [timezone, setTimezone] = useState(event.timezone)
  const [startsAt, setStartsAt] = useState(toLocalInput(event.starts_at, event.timezone))
  const [endsAt, setEndsAt] = useState(toLocalInput(event.ends_at, event.timezone))
  const [regOpens, setRegOpens] = useState(toLocalInput(event.registration_opens_at, event.timezone))
  const [regCloses, setRegCloses] = useState(toLocalInput(event.registration_closes_at, event.timezone))
  const [capacity, setCapacity] = useState(event.capacity ?? '')
  const [visibility, setVisibility] = useState(event.visibility ?? 'public')
  const [contact, setContact] = useState(event.contact ?? {})
  const [types, setTypes] = useState(initialTypes)
  // Last persisted participant types, so save() knows which rows changed.
  // A ref (not the prop) because router.refresh() replaces initialTypes.
  const savedTypesRef = useRef(initialTypes)
  // Languages as last persisted, so save() can tell which ones were dropped
  // and purge their text. A ref for the same reason as savedTypesRef.
  const savedLocalesRef = useRef(eventLocales(event))
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState('')
  const [publishBurst, setPublishBurst] = useState(null)
  const [slugWarnOpen, setSlugWarnOpen] = useState(false)
  const [langWarnOpen, setLangWarnOpen] = useState(false)
  const [publishError, setPublishError] = useState(null)

  // Extra contacts beyond the primary one. Stored on contact.people[] — the
  // same list the Event Page tab edits — so both screens stay in sync.
  const contactPeople = Array.isArray(contact.people) ? contact.people : []
  const setContactPeople = (next) => setContact({ ...contact, people: next })
  const patchPerson = (id, patch) =>
    setContactPeople(contactPeople.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const timezones = Intl.supportedValuesOf?.('timeZone') ?? ['UTC']

  // Load the languages Google Translate supports (fetched + cached server-side)
  // for the add-language picker. Falls back to an empty list on failure.
  useEffect(() => {
    let active = true
    fetch('/api/translate-languages')
      .then((r) => (r.ok ? r.json() : { languages: [] }))
      .then((d) => { if (active) setAllLanguages(d.languages ?? []) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Serialize the Save-button fields so we can tell whether there are unsaved
  // edits. Participant-type edits are included: they used to write per
  // keystroke and were excluded here, which left Save disabled (and dropped
  // edits when a write raced or failed silently). Slug is passed explicitly
  // because "revert & save" writes a value the state hasn't caught up to yet.
  function snapshotOf(typeList, slugValue = slug) {
    return JSON.stringify([
      slugValue, timezone,
      startsAt, endsAt, regOpens, regCloses, capacity, visibility, contact,
      langs, defaultLocale,
      typeList.map((pt) => [pt.id, pt.key, pt.name, pt.capacity, pt.form_id]),
    ])
  }
  function snapshot(slugValue = slug) {
    return snapshotOf(types, slugValue)
  }
  // Baseline = last known saved state. Initialized to the values first loaded
  // from the event; reset after every successful save.
  const [savedSnap, setSavedSnap] = useState(() => snapshot())
  const dirty = snapshot() !== savedSnap

  // Display name for a language code. Falls back to the event's *saved* custom
  // list as well, because a just-removed language is already gone from
  // customLangs state and the warning still has to name it.
  function localeLabel(code) {
    const saved = Array.isArray(event.page_content?.i18n?.custom)
      ? event.page_content.i18n.custom
      : []
    return (
      LOCALE_NAMES[code] ||
      customLangs.find((c) => c.code === code)?.name ||
      saved.find((c) => c.code === code)?.name ||
      code
    )
  }

  // Languages this save would drop. Their translated text is deleted with
  // them, which is not something to do on an accidental click — hence the
  // confirmation below.
  function droppedLocales() {
    const next = [...supportedLocales, ...customLangs.map((c) => c.code)]
    return savedLocalesRef.current.filter((l) => !next.includes(l) && l !== defaultLocale)
  }

  function requestSave() {
    if (droppedLocales().length) {
      setLangWarnOpen(true)
      return
    }
    continueSave()
  }

  // Changing the slug breaks every existing link to this event's public page,
  // so confirm before committing a change. An unchanged slug saves directly.
  function continueSave() {
    setLangWarnOpen(false)
    if (slug !== event.slug) {
      setSlugWarnOpen(true)
      return
    }
    save()
  }

  // Add a language from the Google-supported list. The code is the real Google
  // code (e.g. 'tg', 'yo'), so auto-translate works as-is. Built-ins keep their
  // native display name ("Español", not Google's "Spanish") to match the rest
  // of the app.
  function addLang(lang) {
    if (!lang?.code) return
    setLangs((prev) =>
      prev.some((c) => c.code === lang.code)
        ? prev
        : [...prev, { code: lang.code, name: LOCALE_NAMES[lang.code] ?? lang.name }]
    )
    setLangQuery('')
  }

  // Every other language falls back to the default, so it can't be removed —
  // pick a different default first. This also keeps the list from emptying.
  function removeLang(code) {
    if (code === defaultLocale) return
    setLangs((prev) => prev.filter((c) => c.code !== code))
  }

  // Split for storage: the legacy `supported_locales` column only holds
  // platform built-ins, `page_content.i18n.custom` the organizer-picked ones.
  const supportedLocales = langs.filter((c) => LOCALES.includes(c.code)).map((c) => c.code)
  const customLangs = langs.filter((c) => !LOCALES.includes(c.code))

  // Languages available to add: Google-supported, minus the ones already on the
  // event, filtered by the search query.
  const takenCodes = new Set(langs.map((c) => c.code))
  const langQ = langQuery.trim().toLowerCase()
  const languageChoices = allLanguages
    .filter((l) => !takenCodes.has(l.code))
    .filter(
      (l) =>
        !langQ ||
        l.name.toLowerCase().includes(langQ) ||
        l.code.toLowerCase().includes(langQ)
    )
    .slice(0, 50)

  // Strip dropped languages from every draft form version of this event.
  // Published versions are skipped on purpose: RLS makes them immutable, and
  // they record what registrants actually saw.
  async function purgeFormDrafts(removed, codes) {
    const { data: formRows, error: formsError } = await supabase
      .from('forms')
      .select('id')
      .eq('event_id', event.id)
    if (formsError) return { error: formsError }
    const formIds = (formRows ?? []).map((f) => f.id)
    if (!formIds.length) return { error: null }

    const { data: versions, error: versionsError } = await supabase
      .from('form_versions')
      .select('id, definition')
      .in('form_id', formIds)
      .is('published_at', null)
    if (versionsError) return { error: versionsError }

    for (const version of versions ?? []) {
      const next = stripLocales(version.definition, removed, codes)
      if (JSON.stringify(next) === JSON.stringify(version.definition)) continue
      const { error } = await supabase
        .from('form_versions')
        .update({ definition: next })
        .eq('id', version.id)
      if (error) return { error }
    }
    return { error: null }
  }

  async function save(slugValue = slug) {
    setSlugWarnOpen(false)
    setSaveState('saving')
    setSaveErrorMsg('')
    // Language selection lives in page_content.i18n (shared with the Event Page
    // editor and the form builder). Settings is the only writer; the legacy
    // `supported_locales` column is kept in sync for older readers.
    const existingContent = event.page_content ?? {}
    const existingI18n = existingContent.i18n ?? {}
    const nextAvailable = langs.map((c) => c.code)

    // Normalize the stored text to exactly the languages the event offers.
    // Any other language's text is stale — either dropped this save, or
    // orphaned by a past removal that predates this cleanup. It must go:
    // machine translation only fills EMPTY slots, so leftover text would come
    // back — stale and un-overwritable — the moment the language is re-added.
    // The default language is always offered, so it is never stripped.
    const offered = new Set([...nextAvailable, defaultLocale])
    // Recognize locale maps keyed by any real language code — built-ins, the
    // ones the event had, and the full Google list — so even text orphaned
    // before this logic existed is seen as a locale map and cleaned.
    const codes = new Set([
      ...LOCALES,
      ...savedLocalesRef.current,
      ...nextAvailable,
      ...allLanguages.map((l) => l.code),
    ])
    const removed = new Set([...codes].filter((c) => !offered.has(c)))
    const purge = (value) => (removed.size ? stripLocales(value, removed, codes) : value)

    const { error } = await supabase
      .from('events')
      .update({
        slug: slugValue,
        timezone,
        starts_at: fromLocalInput(startsAt, timezone),
        ends_at: fromLocalInput(endsAt, timezone),
        registration_opens_at: fromLocalInput(regOpens, timezone),
        registration_closes_at: fromLocalInput(regCloses, timezone),
        capacity: capacity === '' ? null : Number(capacity),
        visibility,
        contact: purge(contact),
        default_locale: defaultLocale,
        supported_locales: supportedLocales,
        name: purge(event.name),
        description: purge(event.description),
        location: purge(event.location),
        page_content: {
          ...purge(existingContent),
          i18n: { ...existingI18n, available: nextAvailable, custom: customLangs },
        },
      })
      .eq('id', event.id)
    if (error) {
      setSaveState('error')
      // `check (name ? default_locale)` — the event has no name in the language
      // just picked as default. Say so; the bare "couldn't save" is a dead end.
      setSaveErrorMsg(error.code === '23514' ? t('defaultLanguageNeedsName') : '')
      return
    }

    // The same purge across the event's forms. Only draft versions: RLS makes
    // published ones immutable, and they are the record of what registrants
    // actually saw, so rewriting them would be wrong even if it were allowed.
    if (removed.size) {
      const { error: purgeError } = await purgeFormDrafts(removed, codes)
      if (purgeError) {
        setSaveState('error')
        return
      }
    }

    // Participant-type names are localized too, so they get purged as well; the
    // rewritten name then differs from the saved one and is picked up below.
    const typesToSave = removed.size
      ? types.map((pt) => ({ ...pt, name: purge(pt.name) }))
      : types

    // Participant types: persist every row that differs from the last known
    // saved state. Sequential (not parallel) so a failure stops before later
    // rows and the error is surfaced instead of silently swallowed.
    for (const pt of typesToSave) {
      const original = savedTypesRef.current.find((o) => o.id === pt.id)
      const changed =
        !original ||
        original.key !== pt.key ||
        original.capacity !== pt.capacity ||
        original.form_id !== pt.form_id ||
        JSON.stringify(original.name) !== JSON.stringify(pt.name)
      if (!changed) continue
      const { error: typeError } = await supabase
        .from('participant_types')
        .update({ key: pt.key, name: pt.name, capacity: pt.capacity, form_id: pt.form_id })
        .eq('id', pt.id)
      if (typeError) {
        setSaveState('error')
        return
      }
    }

    setSaveState('saved')
    if (removed.size) setTypes(typesToSave)
    savedTypesRef.current = typesToSave
    savedLocalesRef.current = nextAvailable
    setSavedSnap(snapshotOf(typesToSave, slugValue))
    router.refresh()
  }

  // Slug dialog: discard the slug edit (restore event.slug) and save the rest.
  function revertSlugAndSave() {
    setSlug(event.slug)
    save(event.slug)
  }

  async function setStatus(status) {
    // A published event with no published form leaves registrants on a
    // dead-end wizard (pick single/group, then no options). Require the
    // creator to have published a form THEMSELVES — the default form
    // auto-published at creation is only a fallback and doesn't count.
    if (status === 'published') {
      const { count } = await supabase
        .from('forms')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('creator_published', true)
      if (!count) {
        setPublishError(t('publishNeedsForm'))
        return
      }
    }
    const { error } = await supabase.from('events').update({ status }).eq('id', event.id)
    if (!error) {
      setPublishError(null)
      if (status === 'published') setPublishBurst(Date.now())
      router.refresh()
    }
  }

  async function addType(preset) {
    const base = preset ?? {
      key: `type_${Date.now().toString(36)}`,
      // Seed the name in the event's default language, translated for the UI.
      name: { [defaultLocale]: t('newTypeDefault') },
    }
    const key = uniqueTypeKey(base.key, types.map((pt) => pt.key))
    const { data, error } = await supabase
      .from('participant_types')
      .insert({
        event_id: event.id,
        key,
        name: base.name,
        form_id: forms[0]?.id ?? null,
        sort_order: types.length,
      })
      .select('*')
      .single()
    // Add/remove are discrete actions that persist immediately; re-baseline
    // the dirty snapshot so they don't leave Save spuriously enabled.
    if (!error && data) {
      const next = [...types, data]
      setTypes(next)
      savedTypesRef.current = next
      setSavedSnap(snapshotOf(next))
    }
    setTypePickerOpen(false)
  }

  // Local edit only — persisted by save() together with the event fields.
  // (Writing per keystroke silently lost edits when a request failed or a
  // later keystroke's write raced an earlier one.)
  function updateType(id, patch) {
    setTypes((prev) => prev.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)))
  }

  async function removeType(id) {
    const { error } = await supabase.from('participant_types').delete().eq('id', id)
    if (!error) {
      const next = types.filter((pt) => pt.id !== id)
      setTypes(next)
      savedTypesRef.current = next
      setSavedSnap(snapshotOf(next))
    }
  }

  return (
    <div className={styles.wrap}>
      <section className="card card-pad">
        <h2 style={{ marginBottom: 'var(--s-2)' }}>{t('languages')}</h2>
        <p className={styles.sectionHelp}>{t('languagesHelp')}</p>
        <div className={styles.customLangs}>
          <span className="field-label">{t('availableLanguages')}</span>
          {langs.map((c) => (
            <div key={c.code} className={styles.customLangRow}>
              <span>{c.name}</span>
              {c.code === defaultLocale ? (
                <span className="badge">{t('defaultLanguage')}</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('remove')}
                  onClick={() => removeLang(c.code)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          {!pickerOpen ? (
            <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
              {t('addLanguage')}
            </Button>
          ) : (
            <div className={styles.langPicker}>
              <Input
                autoFocus
                placeholder={t('searchLanguages')}
                value={langQuery}
                onChange={(e) => setLangQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setPickerOpen(false)
                    setLangQuery('')
                  }
                }}
              />
              <div className={styles.langResults}>
                {languageChoices.length === 0 ? (
                  <p className="field-help" style={{ padding: 'var(--s-2)' }}>
                    {t('noLanguageMatches')}
                  </p>
                ) : (
                  languageChoices.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      className={styles.langResult}
                      onClick={() => addLang(l)}
                    >
                      <span>{LOCALE_NAMES[l.code] ?? l.name}</span>
                      <span className={styles.langCode}>{l.code}</span>
                    </button>
                  ))
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPickerOpen(false)
                  setLangQuery('')
                }}
              >
                {t('done')}
              </Button>
            </div>
          )}
          {/* Only true of organizer-picked languages: the five platform
              built-ins do have translated chrome. */}
          {customLangs.length > 0 && (
            <p className="field-help">{t('customLanguageHelp')}</p>
          )}
        </div>

        <Field label={t('defaultLanguage')} help={t('defaultLanguageHelp')}>
          {({ id }) => (
            <NativeSelect
              id={id}
              value={defaultLocale}
              onChange={(e) => setDefaultLocale(e.target.value)}
              style={{ maxWidth: '16rem' }}
            >
              {langs.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </section>

      <section className="card card-pad">
        <div className={styles.grid2}>
          <Field label={t('slug')} help={t('slugHelp')}>
            {({ id }) => <Input id={id} value={slug} onChange={(e) => setSlug(e.target.value)} />}
          </Field>
          <Field label={t('timezone')}>
            {({ id }) => (
              <NativeSelect id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('startsAt')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={startsAt} onChange={setStartsAt} />
            )}
          </Field>
          <Field label={t('endsAt')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={endsAt} onChange={setEndsAt} />
            )}
          </Field>
          <Field label={t('regOpens')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={regOpens} onChange={setRegOpens} />
            )}
          </Field>
          <Field label={t('regCloses')}>
            {({ id }) => (
              <PreferenceDateInput id={id} type="datetime-local" value={regCloses} onChange={setRegCloses} />
            )}
          </Field>
          <Field label={t('capacity')} help={t('capacityHelp')}>
            {({ id }) => (
              <Input id={id} type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            )}
          </Field>
          <Field label={t('visibility')} help={t('visibilityHelp')}>
            {({ id }) => (
              <NativeSelect id={id} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="public">{t('visibilityPublic')}</option>
                <option value="unlisted">{t('visibilityUnlisted')}</option>
              </NativeSelect>
            )}
          </Field>
        </div>
      </section>

      <section className="card card-pad">
        <h2 style={{ marginBottom: 'var(--s-2)' }}>{t('contactInfo')}</h2>
        <p className={styles.sectionHelp}>{t('contactHelp')}</p>
        <div className={styles.grid2}>
          <Field label={t('contactName')}>
            {({ id }) => (
              <Input
                id={id}
                value={contact.name ?? ''}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('contactEmail')}>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={contact.email ?? ''}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('contactPhone')}>
            {({ id }) => (
              <Input
                id={id}
                type="tel"
                value={contact.phone ?? ''}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('contactWebsite')}>
            {({ id }) => (
              <Input
                id={id}
                type="url"
                placeholder="https://example.com"
                value={contact.website ?? ''}
                onChange={(e) => setContact({ ...contact, website: e.target.value })}
              />
            )}
          </Field>
        </div>

        {/* Extra contacts. Same contact.people[] the Event Page tab edits, so
            both screens always show the same list. */}
        <h3 className={styles.contactsSubhead}>{t('additionalContacts')}</h3>
        <div className={styles.contactList}>
          {contactPeople.map((p) => (
            <div key={p.id} className={styles.contactRow}>
              <Input
                placeholder={t('contactName')}
                value={p.name ?? ''}
                onChange={(e) => patchPerson(p.id, { name: e.target.value })}
              />
              <Input
                type="email"
                placeholder={t('contactEmail')}
                value={p.email ?? ''}
                onChange={(e) => patchPerson(p.id, { email: e.target.value })}
              />
              <Input
                type="tel"
                placeholder={t('contactPhone')}
                value={p.phone ?? ''}
                onChange={(e) => patchPerson(p.id, { phone: e.target.value })}
              />
              <Input
                type="url"
                placeholder={t('contactWebsite')}
                value={p.website ?? ''}
                onChange={(e) => patchPerson(p.id, { website: e.target.value })}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('removeContact')}
                onClick={() => setContactPeople(contactPeople.filter((x) => x.id !== p.id))}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setContactPeople([
              ...contactPeople,
              { id: newContactId(), name: '', email: '', phone: '', website: '' },
            ])
          }
        >
          {t('addContact')}
        </Button>
      </section>

      <section className="card card-pad">
        <h2 style={{ marginBottom: 'var(--s-4)' }}>{t('participantTypes')}</h2>
        <div className={styles.typeList}>
          {types.map((pt) => (
            <div key={pt.id} className={styles.typeRow}>
              {/* `key` is a stable internal identifier (referenced by form
                  visibility rules and the registration API) — auto-generated on
                  create and never shown to organizers, who identify types by
                  name everywhere. */}
              <Field label={`${t('typeName')} (${locale})`}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={pt.name?.[locale] ?? pt.name?.en ?? ''}
                    onChange={(e) =>
                      updateType(pt.id, { name: { ...pt.name, [locale]: e.target.value } })
                    }
                  />
                )}
              </Field>
              <Field label={t('capacity')}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min="1"
                    value={pt.capacity ?? ''}
                    onChange={(e) =>
                      updateType(pt.id, {
                        capacity: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                )}
              </Field>
              <Field label={t('form')}>
                {({ id }) => (
                  <NativeSelect
                    id={id}
                    value={pt.form_id ?? ''}
                    onChange={(e) => updateType(pt.id, { form_id: e.target.value || null })}
                  >
                    <option value="" />
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Button variant="ghost" size="sm" onClick={() => removeType(pt.id)}>
                {t('remove')}
              </Button>
            </div>
          ))}
        </div>
        <Dialog
          open={typePickerOpen}
          onOpenChange={setTypePickerOpen}
          title={t('selectType')}
          trigger={
            <Button variant="secondary" size="sm" style={{ marginTop: 'var(--s-3)' }}>
              {t('addType')}
            </Button>
          }
        >
          <p className={styles.sectionHelp}>{t('selectTypeHelp')}</p>
          <div className={styles.presetList}>
            {PARTICIPANT_TYPE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                variant="secondary"
                size="sm"
                onClick={() => addType(preset)}
              >
                {preset.name[locale] ?? preset.name.en}
              </Button>
            ))}
          </div>
          <Button onClick={() => addType(null)} style={{ marginTop: 'var(--s-4)', width: '100%' }}>
            {t('customType')}
          </Button>
        </Dialog>
      </section>

      <div className={styles.footer}>
        <div className={styles.footerStatus} aria-live="polite">
          {publishError ? (
            <span style={{ color: 'var(--danger)' }}>{publishError}</span>
          ) : publishBurst ? (
            <strong className="publish-flash" style={{ color: 'var(--success)' }}>
              {t('eventPublished')}
            </strong>
          ) : null}
        </div>
        <div className={styles.footerActions}>
          {/* Save status sits right next to the Save button so it's noticed. */}
          <span className={styles.saveStatus} aria-live="polite">
            {saveState === 'error' ? (
              <span className="badge badge-cancelled">
                {saveErrorMsg || t('saveFailed')}
              </span>
            ) : dirty ? (
              <span className="badge badge-waitlisted">{t('editsNotSaved')}</span>
            ) : saveState === 'saved' ? (
              <span key={savedSnap} className="badge badge-confirmed publish-flash">
                {t('saved')}
              </span>
            ) : null}
          </span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            {event.status === 'draft' ? (
              <Button variant="secondary" onClick={() => setStatus('published')}>
                {t('publish')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setStatus('draft')}>
                {t('unpublish')}
              </Button>
            )}
            <ConfettiBurst burst={publishBurst} />
          </span>
          <Button onClick={requestSave} disabled={saveState === 'saving' || !dirty}>
            {tCommon('save')}
          </Button>
        </div>
      </div>

      <Dialog
        open={langWarnOpen}
        onOpenChange={setLangWarnOpen}
        title={t('langWarnTitle')}
      >
        <p className={styles.sectionHelp} style={{ marginBottom: 'var(--s-4)' }}>
          {t('langWarnBody', {
            langs: droppedLocales().map((l) => localeLabel(l)).join(', '),
          })}
        </p>
        <div className={styles.slugWarnActions}>
          <Dialog.Close asChild>
            <Button variant="ghost">{tCommon('cancel')}</Button>
          </Dialog.Close>
          <Button onClick={continueSave} disabled={saveState === 'saving'}>
            {t('langWarnConfirm')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={slugWarnOpen}
        onOpenChange={setSlugWarnOpen}
        title={t('slugWarnTitle')}
      >
        <p className={styles.sectionHelp} style={{ marginBottom: 'var(--s-4)' }}>
          {t('slugWarnBody', { old: event.slug, next: slug })}
        </p>
        <div className={styles.slugWarnActions}>
          <Dialog.Close asChild>
            <Button variant="ghost">{tCommon('cancel')}</Button>
          </Dialog.Close>
          <Button variant="secondary" onClick={revertSlugAndSave} disabled={saveState === 'saving'}>
            {t('slugWarnRevert')}
          </Button>
          <Button onClick={() => save()} disabled={saveState === 'saving'}>
            {t('slugWarnConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
