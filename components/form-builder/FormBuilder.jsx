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

  // Which languages a manual translate covers. On a language tab it is that
  // language; on the default tab there is no single target, so it means "push
  // my edits out to all of them" — which is the moment the organizer most wants
  // it, having just rewritten the source text.
  const translateTargets = useMemo(
    () =>
      editLocale === defaultLocale
        ? supportedLocales.filter((l) => l !== defaultLocale)
        : [editLocale],
    [editLocale, defaultLocale, supportedLocales]
  )

  // Is anything out of date for those languages? Decides what the button does
  // and what its tooltip promises.
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

  // The label stays put so the control is findable; the tooltip carries which
  // of the two things a click will do.
  const translateActionHint = hasTranslateUpdates ? t('translateAllHelp') : t('translateForceHelp')

  // The deliberate override; translate-on-switch still handles the common case.
  function runTranslateAction() {
    if (hasTranslateUpdates) {
      translateLocale(translateTargets)
      return
    }
    // Nothing to catch up on, so a click can only mean "redo it all", which
    // overwrites translations a human typed — warn before doing that.
    if (window.confirm(t('translateForceNoChangesConfirm'))) {
      translateLocale(translateTargets, { force: true })
    }
  }

  useEffect(() => {
    if (!initialized.current) return
    if (editLocale === defaultLocale) return
    if (supportedLocales && !supportedLocales.includes(editLocale)) return
    translateLocale(editLocale)
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
        <h2 className="eyebrow">{t('addQuestion')}</h2>
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
          <span className={styles.version}>v{versionNumber}</span>
          <span aria-live="polite" className={styles.saveState}>
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
          </span>
          <span style={{ flex: 1 }} />
          <LanguagePicker
            options={supportedLocales.map((l) => ({ value: l, label: localeNames[l] ?? l }))}
            value={editLocale}
            onChange={setEditLocale}
            ariaLabel={t('ariaEditLanguage')}
          />
          {translateTargets.length > 0 && (
            // Labelled, not an icon: an unlabelled glyph here was unfindable,
            // and this is the control an organizer goes looking for right after
            // editing their source text. The other secondary actions stay icons
            // to buy it the room. Shown on the default tab too — that is where
            // the source gets edited, so it is where "translate my changes" is
            // most wanted, and there it covers every language at once.
            <Button
              variant={hasTranslateUpdates ? 'secondary' : 'ghost'}
              size="sm"
              title={translateActionHint}
              onClick={runTranslateAction}
            >
              {t('translateShort')}
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
