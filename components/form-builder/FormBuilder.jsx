'use client'

import { useEffect, useRef, useState } from 'react'
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
import { lt } from '@/lib/i18n/locales'
import { Button, NativeSelect, ConfettiBurst } from '@/components/ui'
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

  useEffect(() => {
    if (!initialized.current) return
    if (editLocale === defaultLocale) return
    if (supportedLocales && !supportedLocales.includes(editLocale)) return

    let cancelled = false

    async function translateSelectedLocale() {
      try {
        const res = await fetch('/api/translate-form', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            definition,
            source: defaultLocale,
            targets: [editLocale],
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return

        const nextDefinition = data?.translatedDefinition
        if (!nextDefinition) return
        const latestDefinition = useBuilderStore.getState().definition
        if (JSON.stringify(latestDefinition) !== JSON.stringify(definition)) {
          return
        }
        if (JSON.stringify(nextDefinition) !== JSON.stringify(latestDefinition)) {
          store.replaceDefinition(nextDefinition)
        }
      } catch {
        // Translation is best-effort; editing must keep working even if the
        // API key is missing or the request fails.
      }
    }

    translateSelectedLocale()
    return () => {
      cancelled = true
    }
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
            locale={locale}
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
          {supportedLocales.length > 1 && (
            <div className={styles.localeSwitch} role="tablist" aria-label="Edit language">
              {supportedLocales.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={editLocale === l}
                  data-active={editLocale === l}
                  onClick={() => setEditLocale(l)}
                >
                  {localeNames[l] ?? l}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={store.undo} aria-label="Undo">
            ↩
          </Button>
          <Button variant="ghost" size="sm" onClick={store.redo} aria-label="Redo">
            ↪
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPreviewAnswers({})
              setPreviewing(true)
            }}
          >
            {t('previewForm')}
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
                  locale={locale}
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
          <p className={styles.inspectorEmpty}>{lt({ en: 'Select a question to edit it.' }, locale)}</p>
        )}
      </aside>
    </div>
  )
}
