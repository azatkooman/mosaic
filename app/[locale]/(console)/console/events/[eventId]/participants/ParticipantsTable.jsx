'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { formatStructuredAnswer } from '@/lib/form-engine/format'
import { formatDateValue } from '@/lib/dates'
import { applyParticipantFilters, applyParticipantSort } from '@/lib/participants-query'
import { useDateFormatPrefs } from '@/components/providers/DateFormatProvider'
import { Badge, Button, Field, Input, NativeSelect } from '@/components/ui'
import { ParticipantDetail } from './ParticipantDetail'
import styles from './participants.module.css'

const PAGE_SIZE = 50
const STATUSES = ['pending', 'confirmed', 'waitlisted', 'cancelled']
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'waitlisted', 'cancelled'],
  confirmed: ['cancelled'],
  waitlisted: ['confirmed', 'cancelled'],
  cancelled: ['confirmed', 'waitlisted'],
}

/**
 * Filters compile straight to PostgREST operators on the JSONB answers
 * column (GIN-indexed), so filtering happens in the database, not the
 * browser. RLS restricts rows to events the viewer can see.
 */
export function ParticipantsTable({
  eventId,
  participantTypes,
  questions,
  definitionByVersion = {},
  canEdit = false,
  canChangeStatus = false,
}) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFmt = useDateFormatPrefs()
  const supabase = getSupabaseBrowserClient()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [answerFilters, setAnswerFilters] = useState({}) // questionId → value
  const [sort, setSort] = useState({ column: null, dir: 'desc' }) // null = created_at desc
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null) // participant row for the drawer
  const [statusError, setStatusError] = useState('')

  const typeById = useMemo(
    () => new Map(participantTypes.map((pt) => [pt.id, pt])),
    [participantTypes]
  )
  // Only filterable question kinds get a filter control.
  const filterableQuestions = questions.filter((q) =>
    ['select', 'radio', 'multiselect', 'checkbox', 'text', 'email', 'phone'].includes(q.type)
  )

  const filters = { search, statusFilter, typeFilter, answerFilters, sort, page }
  const { data, isLoading, error } = useQuery({
    queryKey: ['participants', eventId, filters],
    queryFn: async () => {
      let q = supabase
        .from('participants')
        .select('id, first_name, last_name, email, status, answers, created_at, participant_type_id, form_version_id', { count: 'exact' })
        .eq('event_id', eventId)
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      // Same filter + sort logic the export uses, so the download matches.
      q = applyParticipantFilters(
        q,
        { status: statusFilter, typeId: typeFilter, search, answerFilters },
        questions
      )
      q = applyParticipantSort(q, sort, questions)

      const { data, error, count } = await q
      if (error) throw error
      return { rows: data ?? [], count: count ?? 0 }
    },
    // v5 API — the old `keepPreviousData: true` option was removed and
    // silently ignored, which made every filter/page change flash empty.
    placeholderData: keepPreviousData,
  })

  async function changeStatus(participantId, status) {
    setStatusError('')
    const { error } = await supabase.rpc('transition_participant_status', {
      p_participant_id: participantId,
      p_new_status: status,
    })
    if (error) {
      setStatusError(error.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['participants', eventId] })
  }

  function exportUrl(format) {
    const params = new URLSearchParams({ eventId, format, locale })
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter) params.set('typeId', typeFilter)
    if (search.trim()) params.set('q', search.trim())
    const cleanAnswers = Object.fromEntries(
      Object.entries(answerFilters).filter(([, v]) => v !== '' && v != null)
    )
    if (Object.keys(cleanAnswers).length) params.set('answers', JSON.stringify(cleanAnswers))
    if (sort.column) {
      params.set('sort', sort.column)
      params.set('dir', sort.dir)
    }
    return `/api/export?${params}`
  }

  // Click a column header: same column toggles direction, a new one starts
  // ascending (A→Z / oldest / lowest).
  function toggleSort(column) {
    setSort((s) =>
      s.column === column
        ? { column, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { column, dir: 'asc' }
    )
    setPage(0)
  }

  const rows = data?.rows ?? []
  const total = data?.count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          style={{ maxInlineSize: '16rem' }}
        />
        <NativeSelect
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
          style={{ width: 'auto' }}
          aria-label={t('console.byStatus')}
        >
          <option value="">{t('console.byStatus')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0) }}
          style={{ width: 'auto' }}
          aria-label={t('console.byType')}
        >
          <option value="">{t('console.byType')}</option>
          {participantTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>{lt(pt.name, locale)}</option>
          ))}
        </NativeSelect>

        <AnswerFilterPicker
          questions={filterableQuestions}
          locale={locale}
          filters={answerFilters}
          onChange={(next) => { setAnswerFilters(next); setPage(0) }}
          labels={{ add: t('console.filterByAnswer'), clear: t('console.clearFilters') }}
        />

        <span className={styles.spacer} />
        <a className="btn btn-secondary btn-sm" href={exportUrl('xlsx')}>
          {t('console.exportExcel')}
        </a>
        <a className="btn btn-secondary btn-sm" href={exportUrl('csv')}>
          {t('console.exportCsv')}
        </a>
      </div>
      {statusError && (
        <p className="alert alert-error" role="alert">{statusError}</p>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <SortHeader label={t('wizard.firstName')} column="first_name" sort={sort} onSort={toggleSort} />
              <SortHeader label={t('wizard.lastName')} column="last_name" sort={sort} onSort={toggleSort} />
              <SortHeader label={t('wizard.email')} column="email" sort={sort} onSort={toggleSort} />
              <SortHeader label={t('console.byType')} column="type" sort={sort} onSort={toggleSort} />
              <SortHeader label={t('console.byStatus')} column="status" sort={sort} onSort={toggleSort} />
              {questions.slice(0, 6).map((q) => (
                <SortHeader key={q.id} label={lt(q.label, locale)} column={`q:${q.id}`} sort={sort} onSort={toggleSort} />
              ))}
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={99}>
                  <span className="alert alert-error" role="alert">
                    {t('console.loadError')}
                  </span>
                </td>
              </tr>
            ) : isLoading ? (
              <tr><td colSpan={99}>{t('common.loading')}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={99}>{t('console.noParticipants')}</td></tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className={styles.rowLink} onClick={() => setSelected(p)}>
                      {p.first_name}
                    </button>
                  </td>
                  <td>{p.last_name}</td>
                  <td>{p.email}</td>
                  <td>{lt(typeById.get(p.participant_type_id)?.name, locale)}</td>
                  <td><Badge tone={p.status}>{t(`status.${p.status}`)}</Badge></td>
                  {questions.slice(0, 6).map((q) => (
                    <td key={q.id}>{formatAnswer(p.answers?.[q.id], q, locale, dateFmt)}</td>
                  ))}
                  <td>
                    <div className={styles.rowActions}>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                        {t('console.viewDetail')}
                      </Button>
                      {canChangeStatus && (
                        <NativeSelect
                          value={p.status}
                          aria-label={t('console.changeStatus')}
                          style={{ width: 'auto', paddingBlock: '0.2rem' }}
                          onChange={(e) => changeStatus(p.id, e.target.value)}
                        >
                          <option value={p.status}>{t(`status.${p.status}`)}</option>
                          {(STATUS_TRANSITIONS[p.status] ?? []).map((s) => (
                            <option key={s} value={s}>{t(`status.${s}`)}</option>
                          ))}
                        </NativeSelect>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pager}>
        <span>{total}</span>
        <span className={styles.spacer} />
        <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          ←
        </Button>
        <span>{page + 1} / {pages}</span>
        <Button variant="ghost" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          →
        </Button>
      </div>

      {selected && (
        <ParticipantDetail
          participant={{
            ...selected,
            participant_type_key: typeById.get(selected.participant_type_id)?.key,
          }}
          typeName={typeById.get(selected.participant_type_id)?.name}
          definition={definitionByVersion[selected.form_version_id] ?? { questions: [] }}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null)
            queryClient.invalidateQueries({ queryKey: ['participants', eventId] })
          }}
        />
      )}
    </div>
  )
}

function SortHeader({ label, column, sort, onSort }) {
  const active = sort.column === column
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={styles.sortHeader}
        onClick={() => onSort(column)}
        title={label}
      >
        <span>{label}</span>
        <span className={styles.sortArrow} aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function formatAnswer(value, question, locale, dateFmt) {
  if (value == null) return ''
  const structured = formatStructuredAnswer(question, value)
  if (structured !== null) return structured
  if (question.type === 'date') return formatDateValue(value, locale, dateFmt)
  if (question.type === 'checkbox') return value ? '✓' : ''
  if (Array.isArray(value)) {
    return value
      .map((v) => lt(question.options?.find((o) => o.value === v)?.label, locale) || v)
      .join(', ')
  }
  if (['select', 'radio'].includes(question.type)) {
    return lt(question.options?.find((o) => o.value === value)?.label, locale) || String(value)
  }
  if (question.type === 'file') return '📎'
  return String(value)
}

function AnswerFilterPicker({ questions, locale, filters, onChange, labels }) {
  const [activeQ, setActiveQ] = useState('')
  const active = Object.entries(filters).filter(([, v]) => v !== '' && v != null)
  const question = questions.find((q) => q.id === activeQ)

  return (
    <div className={styles.answerFilters}>
      <NativeSelect
        value={activeQ}
        onChange={(e) => setActiveQ(e.target.value)}
        style={{ width: 'auto' }}
        aria-label={labels.add}
      >
        <option value="">{labels.add}…</option>
        {questions.map((q) => (
          <option key={q.id} value={q.id}>{lt(q.label, locale)}</option>
        ))}
      </NativeSelect>

      {question && ['select', 'radio', 'multiselect'].includes(question.type) && (
        <NativeSelect
          value={filters[question.id] ?? ''}
          onChange={(e) => onChange({ ...filters, [question.id]: e.target.value })}
          style={{ width: 'auto' }}
        >
          <option value="" />
          {(question.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{lt(o.label, locale)}</option>
          ))}
        </NativeSelect>
      )}
      {question && question.type === 'checkbox' && (
        <NativeSelect
          value={filters[question.id] ?? ''}
          onChange={(e) => onChange({ ...filters, [question.id]: e.target.value })}
          style={{ width: 'auto' }}
        >
          <option value="" />
          <option value="true">✓</option>
        </NativeSelect>
      )}
      {question && ['text', 'email', 'phone'].includes(question.type) && (
        <Input
          value={filters[question.id] ?? ''}
          onChange={(e) => onChange({ ...filters, [question.id]: e.target.value })}
          style={{ maxInlineSize: '10rem' }}
        />
      )}

      {active.length > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={() => { onChange({}); setActiveQ('') }}>
          {labels.clear} ({active.length})
        </button>
      )}
    </div>
  )
}
