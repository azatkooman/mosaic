'use client'

import { useTranslations } from 'next-intl'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { lt } from '@/lib/i18n/locales'
import { QuestionField } from '@/components/form-runtime/QuestionField'
import styles from './builder.module.css'

const noop = () => {}

export function SortableQuestionCard({
  question: q,
  locale,
  defaultLocale,
  typeLabel,
  participantTypes = [],
  selected,
  onSelect,
  onRemove,
}) {
  const t = useTranslations('console')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id })

  const label = lt(q.label, locale, defaultLocale)
  // Show the human type names in the summary, not the internal keys.
  const typeNames = (q.participantTypes ?? [])
    .map((k) => {
      const pt = participantTypes.find((p) => p.key === k)
      return pt ? lt(pt.name, locale, defaultLocale) || k : k
    })
    .join(', ')
  // Unlabeled questions still need something visible to click on.
  const previewQuestion = label ? q : { ...q, label: { [locale]: '…' } }

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={styles.questionCard}
      data-selected={selected || undefined}
      data-section={q.type === 'section' || undefined}
    >
      <button
        className={styles.dragHandle}
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <div
        role="button"
        tabIndex={0}
        className={styles.questionBody}
        aria-label={label || typeLabel}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
      >
        <span className={styles.questionMeta}>
          {typeLabel}
          {q.visibleIf?.rules?.length ? ' · ⑂' : ''}
          {q.participantTypes?.length ? ` · ${typeNames}` : ''}
          {q.type === 'date' && (
            <>
              {' '}
              <span
                className="tip tip-right"
                data-tip={t('dateFormatHint')}
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('dateFormatHint')}
              >
                ⓘ
              </span>
            </>
          )}
        </span>
        {/* Live preview of what a respondent sees; inert so clicks select the card. */}
        <div className={styles.questionPreview} inert>
          {q.type === 'section' ? (
            <div className={styles.sectionPreview}>
              <h3>{label || <em className={styles.unlabeled}>…</em>}</h3>
              {q.help && <p>{lt(q.help, locale, defaultLocale)}</p>}
            </div>
          ) : (
            <QuestionField
              question={previewQuestion}
              locale={locale}
              defaultLocale={defaultLocale}
              value={undefined}
              onChange={noop}
              preview
            />
          )}
        </div>
      </div>
      <button className={styles.removeBtn} aria-label="Delete" onClick={onRemove}>
        ×
      </button>
    </li>
  )
}
