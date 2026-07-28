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
import { Button, NativeSelect, ConfettiBurst, LanguagePicker } from '@/components/ui'
import { FormRenderer } from '@/components/form-runtime/FormRenderer'
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
  const [publishBurst, setPublishBurst] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewAnswers, setPreviewAnswers] = useState({})
  const [previewTypeKey, setPreviewTypeKey] = useState(participantTypes[0]?.key ?? '')
  const [editLocale, setEditLocale] = useState(defaultLocale)
  const initialized = useRef(false)

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
    try {
      const res = await fetch('/api/translate-form', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          definition: snapshot,
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

      const nextDefinition = data?.translatedDefinition
      if (!nextDefinition) return
      const latestDefinition = useBuilderStore.getState().definition
      if (JSON.stringify(latestDefinition) !== JSON.stringify(snapshot)) {
        return
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
      return
    }
    // Flush pending edits and REQUIRE the flush to succeed — publishing
    // after a failed flush would publish the stale server-side definition.
    const { error: flushError } = await supabase
      .from('form_versions')
      .update({ definition })
      .eq('id', versionId)
    if (flushError) {
      setSaveState('saveFailed')
      return
    }
    // Clearing dirty also cancels any pending autosave timer (the autosave
    // effect re-runs and its cleanup clears the timeout), so a late
    // autosave can never fire against the just-published version.
    store.markSaved()
    const { error } = await supabase.rpc('publish_form_version', { p_version_id: versionId })
    if (error) {
      setSaveState('publishFailed')
      return
    }
    setSaveState('published')
    setPublishBurst(Date.now())
    router.refresh()
  }

  const selected = definition.questions.find((q) => q.id === selectedId)

  if (previewing) {
    return (
      <div className={styles.preview}>
        <div className={styles.previewHead}>
          <Button variant="ghost" size="sm" onClick={() => setPreviewing(false)}>
            ← {t('backToEditor')}
          </Button>
          <span className={styles.previewHint}>{t('previewHint')}</span>
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
        </div>
        <div className={styles.previewForm}>
          <FormRenderer
            definition={definition}
            participantTypeKey={previewTypeKey}
            locale={editLocale}
            defaultLocale={defaultLocale}
            answers={previewAnswers}
            onChange={(questionId, value) =>
              setPreviewAnswers((a) => ({ ...a, [questionId]: value }))
            }
            preview
          />
        </div>
      </div>
    )
  }

  return (
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
          <span style={{ flex: 1 }} />
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
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('previewForm')}
            title={t('previewForm')}
            onClick={() => {
              setPreviewAnswers({})
              setPreviewing(true)
            }}
          >
            <span aria-hidden="true">◱</span>
          </Button>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Button size="sm" onClick={publish}>
              {t('publishForm')}
            </Button>
            <ConfettiBurst burst={publishBurst} />
          </span>
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
  )
}
