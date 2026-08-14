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
  initialAppearance,
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
  const appearanceLoaded = useRef(false)

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

  // Debounced autosave of the appearance, mirroring the draft autosave above.
  // No Publish and no dirty flag: forms.appearance is not versioned, so what is
  // written here is what a registrant gets, and the unpublished-work guard has
  // nothing to warn about.
  //
  // The ref skips the mount pass. Without it every visit to a form would write
  // its appearance straight back — harmless in content but enough to make every
  // form look freshly edited.
  useEffect(() => {
    if (!appearanceLoaded.current) {
      appearanceLoaded.current = true
      return
    }
    setAppearanceState('saving')
    const handle = setTimeout(async () => {
      // Deleting a question strands its override, which is already harmless at
      // render time — the resolver never looks an unknown id up — so this is
      // housekeeping, and it runs here because saving is the only moment that
      // sees both the appearance and the current question list.
      const pruned = pruneQuestionStyles(
        appearance,
        useBuilderStore.getState().definition.questions.map((q) => q.id)
      )
      if (pruned !== appearance) {
        setAppearance(pruned)
        return
      }
      const { error } = await supabase
        .from('forms')
        .update({ appearance: pruned })
        .eq('id', formId)
      setAppearanceState(error ? 'failed' : 'saved')
    }, 900)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance, formId])

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

  return (
    <>
      {/* Unlike the other two editors this one autosaves, so the question on
          the way out is not "save?" but "publish?" — the edits are safe in the
          draft either way, and the thing that would surprise an organizer is
          finding the live form unchanged. Hence a third button rather than
          reworded copy: publishing IS what they meant to do.

          Outside the tabs, not inside one: the draft is just as unpublished
          from the Forms page tab, and a guard mounted on only one of them would
          let the organizer leave unwarned from the other. */}
      <UnsavedChangesGuard
        when={unpublished}
        title={t('unpublishedTitle')}
        body={t('unpublishedBody')}
        leaveLabel={t('unpublishedLeave')}
        action={{ label: t('publish'), busyLabel: t('publishing'), run: publish }}
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

              {/* "Publish", not "Publish form": inside a form builder the noun
                  is already given, and it is what this file's own
                  unsaved-changes dialog has always called it. Preview used to
                  stand beside it here; the Preview form tab replaced it. */}
              <div className={styles.headActions}>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Button size="sm" onClick={publish}>
                    {t('publish')}
                  </Button>
                  <ConfettiBurst burst={publishBurst} />
                </span>
              </div>
            </div>

            {/* Its own line under the actions rather than inside them: a failed save
                is the worst thing that can happen in a builder, so it stays next to
                Publish where it gets noticed instead of in the far-left column — and
                it can never push Publish sideways from here. Absent when idle. */}
            {saveState !== 'idle' && (
              <p aria-live="polite" className={styles.saveStateRow}>
                {saveState === 'saving' && t('draftSaving')}
                {saveState === 'saved' && t('draftSaved')}
                {saveState === 'published' && (
                  <strong className="publish-flash" style={{ color: 'var(--success)' }}>
                    {t('formPublished')}
                  </strong>
                )}
                {saveState === 'saveFailed' && (
                  <strong style={{ color: 'var(--danger)' }}>{t('saveFailed')}</strong>
                )}
                {saveState === 'publishFailed' && (
                  <strong style={{ color: 'var(--danger)' }}>{t('publishFailed')}</strong>
                )}
                {saveState === 'publishEmpty' && (
                  <strong style={{ color: 'var(--danger)' }}>{t('publishNeedsQuestion')}</strong>
                )}
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
              <Button
                variant={zone ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setZone(zone ? null : 'theme')}
              >
                {t('formCustomize')}
              </Button>
              <p className={styles.pageTabHint}>
                {appearanceState === 'saving' && t('draftSaving')}
                {appearanceState === 'saved' && t('draftSaved')}
                {appearanceState === 'failed' && (
                  <strong style={{ color: 'var(--danger)' }}>{t('saveFailed')}</strong>
                )}
                {appearanceState === 'idle' && t('formsPageHint')}
              </p>
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
                  onChange={setAppearance}
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
