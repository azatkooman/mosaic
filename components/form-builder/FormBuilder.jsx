'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { eventMediaUrl } from '@/lib/storage'
import { LOCALES, lt } from '@/lib/i18n/locales'
import { hasStaleTranslations } from '@/lib/form-localization'
import {
  Button,
  NativeSelect,
  ConfettiBurst,
  LanguagePicker,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui'
import { UnsavedChangesGuard } from '@/components/console/UnsavedChangesGuard'
import { resolveFormAppearance, pruneQuestionStyles } from '@/lib/form-appearance'
import { RegisterPreview } from './RegisterPreview'
import { FormAppearancePanel } from './FormAppearancePanel'
import { useBuilderStore } from './store'
import { SortableQuestionCard } from './SortableQuestionCard'
import { QuestionInspector } from './QuestionInspector'
import styles from './builder.module.css'

const QUESTION_TYPES = [
  'name', 'text', 'textarea', 'select', 'multiselect', 'radio', 'checkbox',
  'date', 'number', 'email', 'phone', 'address', 'file', 'section',
]

export function FormBuilder({
  versionId,
  versionNumber,
  initialDefinition,
  participantTypes,
  eventName,
  formId,
  eventId,
  initialAppearance,
  // The event's hero image, offered in the panel as "use the event cover" so a
  // header can track the event page instead of needing its own upload. Passed
  // as the stored PATH, not a URL: it is what gets written into the appearance
  // when inherited, and a URL there would rot the moment the bucket moves.
  coverImagePath,
  eventTheme,
  defaultLocale,
  supportedLocales,
  localeNames,
}) {
  const t = useTranslations('console')
  const tq = useTranslations('questionTypes')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const store = useBuilderStore()
  const { definition, selectedId, dirty } = store
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | published
  // Edits made in this session that are not live yet. The autosave writes them
  // to the DRAFT version within ~1.2s, so nothing is ever lost here — but the
  // registration form the public fills in is `forms.current_version_id`, and
  // that does not move until Publish. Leaving with this true means the work is
  // safe and simply has no effect, which is its own kind of surprise.
  //
  // Scoped to the session on purpose. The page opens a draft via
  // create_draft_version on every visit, so "a draft exists" is true the
  // moment you arrive and would warn on a page nobody edited.
  const [unpublished, setUnpublished] = useState(false)
  const [publishBurst, setPublishBurst] = useState(null)
  const [previewAnswers, setPreviewAnswers] = useState({})
  const [previewTypeKey, setPreviewTypeKey] = useState(participantTypes[0]?.key ?? '')
  const [editLocale, setEditLocale] = useState(defaultLocale)
  const initialized = useRef(false)

  // --- Appearance (the Forms page tab) ---
  //
  // Kept in its own state and its own column rather than in the builder store,
  // because it is not part of the definition and must not join the undo stack
  // or the draft/publish cycle: a colour is live the moment it saves, and the
  // questions are not live until Publish. Two lifecycles, two homes.
  const [appearance, setAppearance] = useState(initialAppearance ?? {})
  const [zone, setZone] = useState(null) // null = panel closed
  const [styledQuestionId, setStyledQuestionId] = useState(null)
  const [appearanceState, setAppearanceState] = useState('idle') // idle|saving|saved|failed
  const [appearanceDirty, setAppearanceDirty] = useState(false)

  const resolved = useMemo(
    () => resolveFormAppearance(appearance, eventTheme),
    [appearance, eventTheme]
  )

  useEffect(() => {
    if (!initialized.current) {
      store.init(initialDefinition)
      initialized.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep editLocale valid if supportedLocales changes.
  useEffect(() => {
    if (supportedLocales && !supportedLocales.includes(editLocale)) {
      setEditLocale(defaultLocale)
    }
  }, [supportedLocales, defaultLocale, editLocale])

  // Machine-translate into the selected language. The route only sends fields
  // whose default-language text changed since they were last translated, so
  // this is cheap to run on every tab switch: an unedited form translates
  // nothing, an edited heading translates one string, and a language the
  // organizer just added gets the whole form. `force` ignores that bookkeeping
  // and retranslates everything, including text a human typed.
  async function translateLocale(target, { force = false } = {}) {
    const targets = Array.isArray(target) ? target : [target]
    if (!targets.length) return
    const snapshot = useBuilderStore.getState().definition
    // The intro blurb on the Forms page tab is localized text like any question
    // label, and it lives in the appearance rather than the definition — so both
    // travel as one document. The walker only touches objects whose keys are
    // language codes, which is why hex colours, question ids and type names
    // inside the appearance pass through untouched.
    const appearanceSnapshot = appearance
    try {
      const res = await fetch('/api/translate-form', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          document: { definition: snapshot, appearance: appearanceSnapshot },
          source: defaultLocale,
          targets,
          // Tell the route the event's full language set so custom-language
          // content maps (e.g. {en, pt}) are recognized and translated.
          locales: supportedLocales,
          force,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return

      const nextDefinition = data?.translatedDocument?.definition
      const nextAppearance = data?.translatedDocument?.appearance
      if (!nextDefinition) return
      const latestDefinition = useBuilderStore.getState().definition
      if (JSON.stringify(latestDefinition) !== JSON.stringify(snapshot)) {
        return
      }
      // Guarded separately: the appearance can have been edited in the panel
      // while the request was in flight, and adopting a stale copy would undo
      // whatever the organizer just picked.
      if (
        nextAppearance &&
        JSON.stringify(nextAppearance) !== JSON.stringify(appearanceSnapshot)
      ) {
        setAppearance((current) =>
          JSON.stringify(current) === JSON.stringify(appearanceSnapshot)
            ? nextAppearance
            : current
        )
        // A translated intro blurb is an unsaved change like any other now that
        // appearance waits for Save. It used to ride out on the autosave; left
        // unflagged it would sit in the editor looking done and never be
        // written, which is worse than the nagging the flag causes.
        setAppearanceDirty(true)
      }
      // Also persists translation bookkeeping on runs that translated nothing:
      // adopting provenance for content that predates tracking has to be saved,
      // or the next run would re-adopt against a by-then-edited source and mark
      // the stale translation fresh.
      if (JSON.stringify(nextDefinition) !== JSON.stringify(latestDefinition)) {
        store.replaceDefinition(nextDefinition)
      }
    } catch {
      // Translation is best-effort; editing must keep working even if the
      // API key is missing or the request fails.
    }
  }

  // Every language the form is offered in bar the source. Both the manual
  // action and the on-switch catch-up cover all of them: per-field diffing
  // means unchanged fields cost nothing, so widening the scope is close to free
  // and saves the organizer visiting each tab in turn to catch everything up.
  const translateTargets = useMemo(
    () => supportedLocales.filter((l) => l && l !== defaultLocale),
    [defaultLocale, supportedLocales]
  )

  // Only used to phrase the confirm, since the button always forces.
  const hasTranslateUpdates = useMemo(
    () =>
      translateTargets.length > 0 &&
      hasStaleTranslations(
        definition,
        defaultLocale,
        translateTargets,
        new Set([...LOCALES, ...supportedLocales])
      ),
    [definition, defaultLocale, translateTargets, supportedLocales]
  )

  // Always destructive — it replaces translations a human typed — so it always
  // asks. With nothing stale the prompt says that too, so a stray click can't
  // be mistaken for a routine catch-up.
  function runTranslateAction() {
    const prompt = hasTranslateUpdates
      ? t('translateForceConfirm')
      : t('translateForceNoChangesConfirm')
    if (window.confirm(prompt)) {
      translateLocale(translateTargets, { force: true })
    }
  }

  // Switching language is the safe pass: it translates the fields whose source
  // text changed since they were last translated, and nothing else. It covers
  // every language rather than only the one being switched to, so one switch
  // brings the whole form up to date instead of demanding a tour of the tabs —
  // and it fires switching back to the source language too, since by then the
  // organizer has usually just finished editing it.
  useEffect(() => {
    if (!initialized.current) return
    if (!translateTargets.length) return
    translateLocale(translateTargets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLocale, defaultLocale, supportedLocales])

  // Any edit at all leaves something unpublished, and stays that way through
  // the autosave that follows — only Publish clears it.
  useEffect(() => {
    if (dirty) setUnpublished(true)
  }, [dirty])

  // Successes are announcements of something that finished; failures are
  // conditions that still need dealing with. Only the first kind expires.
  //
  // Left set, 'published' sat on screen for the rest of the session — and since
  // Radix unmounts the inactive tab panel, every tab switch remounted the
  // element and replayed its `publish-flash` animation, so the form looked like
  // it had just been published again. Clearing the state is what stops that,
  // rather than suppressing the animation: a confirmation that never goes away
  // has stopped confirming anything in particular by the time it is stale.
  useEffect(() => {
    if (saveState !== 'saved' && saveState !== 'published') return
    const id = setTimeout(() => setSaveState('idle'), 4000)
    return () => clearTimeout(id)
  }, [saveState])

  // Debounced autosave of the draft version.
  useEffect(() => {
    if (!dirty) return
    setSaveState('saving')
    const handle = setTimeout(async () => {
      const { error } = await supabase
        .from('form_versions')
        .update({ definition })
        .eq('id', versionId)
      if (!error) {
        store.markSaved()
        setSaveState('saved')
      } else {
        // Losing edits silently (expired session, viewer role, network) is
        // the worst failure mode a builder can have — say so, loudly.
        setSaveState('saveFailed')
      }
    }, 1200)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, dirty, versionId])

  // Appearance is held here until Save, and that is a deliberate reversal of
  // how it used to work.
  //
  // It autosaved on a 900ms debounce, which followed correctly from the column
  // being unversioned (0055): what is written to forms.appearance IS what a
  // registrant gets, so there was no draft to publish and nothing for a guard
  // to warn about. What that missed is that "not versioned" and "live the
  // instant you drag a slider" are different claims, and only the first one was
  // wanted. Every intermediate colour on the way to the intended one reached
  // the public form, and leaving the tab mid-experiment left whatever was on
  // screen at the time as the live appearance.
  //
  // So it now matches the event page editor: edit freely, see it in the
  // preview, and nothing reaches a registrant until Save. Still no versions —
  // that part of 0055 stands, and a colour change still mints nothing and
  // needs no Publish.
  // Wraps every write from the panel so no caller has to remember the flag, and
  // clears any stale "Saved" so the line cannot claim work is stored while an
  // enabled Save button says otherwise.
  function editAppearance(next) {
    setAppearance(next)
    setAppearanceDirty(true)
    setAppearanceState('idle')
  }

  async function saveAppearance() {
    setAppearanceState('saving')
    // Deleting a question strands its override, which is already harmless at
    // render time — the resolver never looks an unknown id up — so this is
    // housekeeping, and it runs here because saving is the only moment that
    // sees both the appearance and the current question list.
    const pruned = pruneQuestionStyles(
      appearance,
      useBuilderStore.getState().definition.questions.map((q) => q.id)
    )
    const { error } = await supabase
      .from('forms')
      .update({ appearance: pruned })
      .eq('id', formId)
    if (error) {
      setAppearanceState('failed')
      return false
    }
    // Adopted only on success, so a failed save leaves the organizer's own
    // object in hand rather than a pruned copy of something never stored.
    if (pruned !== appearance) setAppearance(pruned)
    setAppearanceState('saved')
    setAppearanceDirty(false)
    // Returned so the leave-guard can tell a real save from a failed one and
    // only then continue the navigation it interrupted.
    return true
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function publish() {
    // An empty form would render a blank registration step — refuse to
    // publish until it has at least one real question.
    const realQuestions = definition.questions.filter(
      (q) => q.type !== 'section' && !q.archived
    )
    if (realQuestions.length === 0) {
      setSaveState('publishEmpty')
      return false
    }
    // Flush pending edits and REQUIRE the flush to succeed — publishing
    // after a failed flush would publish the stale server-side definition.
    const { error: flushError } = await supabase
      .from('form_versions')
      .update({ definition })
      .eq('id', versionId)
    if (flushError) {
      setSaveState('saveFailed')
      return false
    }
    // Clearing dirty also cancels any pending autosave timer (the autosave
    // effect re-runs and its cleanup clears the timeout), so a late
    // autosave can never fire against the just-published version.
    store.markSaved()
    const { error } = await supabase.rpc('publish_form_version', { p_version_id: versionId })
    if (error) {
      setSaveState('publishFailed')
      return false
    }
    setSaveState('published')
    setUnpublished(false)
    setPublishBurst(Date.now())
    router.refresh()
    // Returned so the leave-guard can tell a real publish from a refused one
    // and only then continue the navigation it interrupted.
    return true
  }

  const selected = definition.questions.find((q) => q.id === selectedId)

  // Which of the two tabs has work outstanding decides which question the guard
  // asks, because they are not the same question and one dialog cannot ask
  // both. Questions autosave to a draft and are lost to nobody — what is at
  // stake there is that the live form still shows the old version, so the ask
  // is "publish?". Appearance is not saved at all until Save, so what is at
  // stake there is losing it, and the ask is the ordinary "leave without
  // saving?" the event page editor uses for exactly the same reason.
  //
  // One instance rather than three mounted side by side: each guard registers
  // its own document-wide click listener and owns its own dialog, so three
  // would mean three listeners and, if two ever armed at once, two dialogs over
  // one click. Choosing the shape here keeps it to one of each.
  //
  // Note this is about the two tabs' STATE, not which tab is open. Switching
  // tabs is not navigation and never has been — the triggers are buttons, not
  // links, so the guard does not see them — which is what lets an organizer
  // move between Questions and Preview form freely while both have work in
  // hand, and get asked only on the way off the page.
  const guard =
    unpublished && appearanceDirty
      ? {
          title: t('unsavedBothTitle'),
          body: t('unsavedBothBody'),
          leaveLabel: t('unsavedBothLeave'),
          action: {
            label: t('unsavedBothAction'),
            busyLabel: t('publishing'),
            // Appearance first: it is the one that would be lost. If it fails,
            // stop — publishing on top would report success for half the work
            // while the half that can vanish silently did.
            run: async () => (await saveAppearance()) && (await publish()),
          },
        }
      : unpublished
        ? {
            title: t('unpublishedTitle'),
            body: t('unpublishedBody'),
            leaveLabel: t('unpublishedLeave'),
            action: { label: t('publishForm'), busyLabel: t('publishing'), run: publish },
          }
        : appearanceDirty
          ? {
              // The event page editor's own copy, by default rather than by
              // copying strings: same situation, same words.
              action: { label: t('savePreview'), busyLabel: t('draftSaving'), run: saveAppearance },
            }
          : null

  return (
    <>
      {/* Outside the tabs, not inside one: work on either tab is just as
          outstanding from the other, and a guard mounted on a single tab would
          let the organizer leave unwarned from its neighbour. `guard` above
          decides which of the three questions this asks. */}
      <UnsavedChangesGuard
        when={!!guard}
        title={guard?.title}
        body={guard?.body}
        leaveLabel={guard?.leaveLabel}
        action={guard?.action ?? null}
      />
      {/* Questions is what "Edit form" means and stays the landing tab; Forms
          page is the same form seen from the registrant's side. */}
      <Tabs defaultValue="questions">
        <TabsList className={`tabs-list ${styles.tabsHead}`}>
          <TabsTrigger value="questions">{t('tabQuestions')}</TabsTrigger>
          <TabsTrigger value="formsPage">{t('tabFormsPage')}</TabsTrigger>
        </TabsList>

        <TabsContent value="questions">
        <div className={styles.builder}>
          {/* Palette */}
          <aside className={styles.palette} aria-label={t('addQuestion')}>
            {/* The version rides here rather than in the canvas header: that row has
                to fit six controls beside a 20rem inspector in a 448px column, and
                a passive fact was crowding out the actions. */}
            <div className={styles.paletteHead}>
              <h2 className="eyebrow">{t('addQuestion')}</h2>
              <span className={styles.version}>v{versionNumber}</span>
            </div>
            <div className={styles.paletteGrid}>
              {QUESTION_TYPES.map((type) => (
                <button
                  key={type}
                  className={styles.paletteItem}
                  onClick={() => store.addQuestion(type)}
                >
                  {tq(type)}
                </button>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <section className={styles.canvas}>
            <div className={styles.canvasHead}>
              {/* Two groups, not one right-tucked run of six controls. What you
                  edit WITH sits left, in the space that was previously held empty
                  by a flex spacer; what you DO sits right. The old row fitted five
                  controls and wrapped the sixth, so Publish — the primary action —
                  landed alone on a line of its own while the space it needed sat
                  unused at the far left. Grouped, the pair wraps together or not at
                  all, and can never be split from each other. */}
              <div className={styles.headTools}>
              <LanguagePicker
                className={styles.langPicker}
                options={supportedLocales.map((l) => ({ value: l, label: localeNames[l] ?? l }))}
                value={editLocale}
                onChange={setEditLocale}
                ariaLabel={t('ariaEditLanguage')}
                /* Switching languages is now the only route to the safe pass, so
                   say so somewhere the organizer will actually look. */
                title={t('ariaLanguageHint')}
              />
              {translateTargets.length > 0 && (
                // The one manual translate action, and it is the destructive one:
                // catching up edited fields happens by switching language, which
                // costs nothing when nothing changed. Labelled short because the
                // row has to hold six controls in a 448px column — the tooltip
                // carries what it does and points at the cheaper alternative.
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('translateAllTooltip')}
                  onClick={runTranslateAction}
                >
                  {t('translateAllShort')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={store.undo}
                aria-label={t('ariaUndo')}
                title={t('ariaUndo')}
              >
                ↩
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={store.redo}
                aria-label={t('ariaRedo')}
                title={t('ariaRedo')}
              >
                ↪
              </Button>
              </div>

              {/* "Publish Form", spelled out: the same button now also stands
                  on the Preview form tab, where the surrounding controls are
                  about appearance and a bare "Publish" would read as publishing
                  the colours — which is exactly what it does NOT do (appearance
                  saves on its own and is never versioned). Naming it once, in
                  `publishForm`, is what keeps the two labels identical.
                  Preview used to stand beside it here; the tab replaced it. */}
              <div className={styles.headActions}>
                <PublishButton onPublish={publish} burst={publishBurst} label={t('publishForm')} />
              </div>
            </div>

            {/* Its own line under the actions rather than inside them: a failed save
                is the worst thing that can happen in a builder, so it stays next to
                Publish where it gets noticed instead of in the far-left column — and
                it can never push Publish sideways from here. Absent when idle. */}
            {saveState !== 'idle' && (
              <p aria-live="polite" className={styles.saveStateRow}>
                <SaveStateText t={t} state={saveState} />
              </p>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (over && active.id !== over.id) store.moveQuestion(active.id, over.id)
              }}
            >
              <SortableContext
                items={definition.questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className={styles.questionList}>
                  {definition.questions.map((q) => (
                    <SortableQuestionCard
                      key={q.id}
                      question={q}
                      locale={editLocale}
                      defaultLocale={defaultLocale}
                      typeLabel={tq(q.type)}
                      participantTypes={participantTypes}
                      selected={q.id === selectedId}
                      onSelect={() => store.select(q.id)}
                      onRemove={() => store.removeQuestion(q.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </section>

          {/* Inspector */}
          <aside className={styles.inspector}>
            {selected ? (
              <QuestionInspector
                key={selected.id}
                question={selected}
                allQuestions={definition.questions}
                participantTypes={participantTypes}
                defaultLocale={defaultLocale}
                supportedLocales={supportedLocales}
                localeNames={localeNames}
                editLocale={editLocale}
                onChange={(patch) => store.updateQuestion(selected.id, patch)}
              />
            ) : (
              <p className={styles.inspectorEmpty}>{t('inspectorEmpty')}</p>
            )}
          </aside>
        </div>
        </TabsContent>

        <TabsContent value="formsPage">
          <div className={styles.pageTab}>
            {/* Builder chrome, deliberately OUTSIDE the frame: everything
                inside it is a picture of the register screen, so a control that
                belongs to the console cannot sit among them. */}
            <div className={styles.pageTabBar}>
              {participantTypes.length > 1 && (
                <label className={styles.previewTypePick}>
                  <span>{t('previewAs')}</span>
                  <NativeSelect
                    value={previewTypeKey}
                    onChange={(e) => setPreviewTypeKey(e.target.value)}
                  >
                    {participantTypes.map((pt) => (
                      <option key={pt.key} value={pt.key}>
                        {lt(pt.name, locale, defaultLocale) || pt.key}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {/* Secondary in both states now, where it used to go primary while
                  the panel was closed. That toggle was fine when this was the
                  only button on the row; beside Publish Form it put two filled
                  primaries side by side in the common case, which says the two
                  matter equally when only one of them changes what registrants
                  get. Nothing is lost — a whole panel opening next to the
                  preview says "open" far louder than a fill ever did. */}
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={!!zone}
                onClick={() => setZone(zone ? null : 'theme')}
              >
                {t('formCustomize')}
              </Button>
              {/* This tab's own status, and only its own. It used to give way
                  to `saveState` because Publish Form stood in this row and its
                  result had to land somewhere; with that button gone, publishing
                  is a Questions-tab action again and reporting it here would be
                  answering a click that happened on another screen. */}
              <p aria-live="polite" className={styles.pageTabHint}>
                {appearanceState === 'saving' && t('draftSaving')}
                {appearanceState === 'saved' && t('saved')}
                {appearanceState === 'failed' && (
                  <strong style={{ color: 'var(--danger)' }}>{t('saveFailed')}</strong>
                )}
                {appearanceState === 'idle' &&
                  (appearanceDirty ? t('unsavedPreview') : t('formsPageHint'))}
              </p>
              {/* Save, not Publish. Publish Form stood here and had to go: it
                  publishes the QUESTIONS, and beside a row of appearance
                  controls that reads as publishing the colours — which it never
                  did and now visibly does not, since the colours have their own
                  button that does exactly what it says.

                  Disabled until there is something to save, matching the event
                  page editor's own Save Page down to the condition. */}
              <Button
                size="sm"
                onClick={saveAppearance}
                disabled={appearanceState === 'saving' || !appearanceDirty}
              >
                {t('savePreview')}
              </Button>
            </div>
            <div className={`${styles.pageSplit} ${zone ? styles.pageSplitOpen : ''}`}>
              <div className={styles.pageFrame}>
                <RegisterPreview
                  definition={definition}
                  eventName={eventName}
                  participantTypes={participantTypes}
                  participantTypeKey={previewTypeKey}
                  headerImageUrl={eventMediaUrl(resolved?.header?.bg_image_path)}
                  /* The language the form is being previewed in follows the
                     builder's own language control on the Questions tab — the
                     picker inside the frame belongs to the registrant's screen
                     and does nothing. */
                  locale={editLocale}
                  defaultLocale={defaultLocale}
                  supportedLocales={supportedLocales}
                  localeNames={localeNames}
                  answers={previewAnswers}
                  onAnswerChange={(questionId, value) =>
                    setPreviewAnswers((a) => ({ ...a, [questionId]: value }))
                  }
                  resolved={resolved}
                  /* Only while the panel is open, so a preview being read
                     rather than edited carries no console controls at all. */
                  onEditZone={zone ? setZone : undefined}
                />
              </div>
              {zone && (
                <FormAppearancePanel
                  appearance={appearance}
                  resolved={resolved}
                  onChange={editAppearance}
                  zone={zone}
                  onZoneChange={setZone}
                  onClose={() => setZone(null)}
                  questions={definition.questions.filter((q) => !q.archived)}
                  selectedQuestionId={styledQuestionId}
                  onSelectQuestion={setStyledQuestionId}
                  editLocale={editLocale}
                  defaultLocale={defaultLocale}
                  eventId={eventId}
                  coverImagePath={coverImagePath}
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}

/**
 * Publish Form, with its confetti.
 *
 * Extracted because it now stands on two tabs, and the pair has to stay one
 * button: the wrapper span is what positions the burst over it, so a second
 * hand-rolled copy would be a button that publishes without celebrating — or
 * worse, one whose label drifts from the other's.
 */
function PublishButton({ onPublish, burst, label }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <Button size="sm" onClick={onPublish}>
        {label}
      </Button>
      <ConfettiBurst burst={burst} />
    </span>
  )
}

/**
 * The save/publish outcome as text, shared by both tabs' status lines.
 *
 * Renders nothing at idle so a caller can drop it straight into a line that
 * shows something else the rest of the time. Kept as one component rather than
 * six inline conditionals twice over, because half of these are failures and a
 * failure that only one tab knows how to say is a failure the organizer on the
 * other tab never sees.
 */
function SaveStateText({ t, state }) {
  if (state === 'saving') return t('draftSaving')
  if (state === 'saved') return t('draftSaved')
  if (state === 'published') {
    return (
      <strong className="publish-flash" style={{ color: 'var(--success)' }}>
        {t('formPublished')}
      </strong>
    )
  }
  const failures = {
    saveFailed: 'saveFailed',
    publishFailed: 'publishFailed',
    publishEmpty: 'publishNeedsQuestion',
  }
  if (failures[state]) {
    return <strong style={{ color: 'var(--danger)' }}>{t(failures[state])}</strong>
  }
  return null
}
