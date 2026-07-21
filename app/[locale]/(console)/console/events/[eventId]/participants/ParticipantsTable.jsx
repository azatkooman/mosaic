'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { formatStructuredAnswer } from '@/lib/form-engine/format'
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
  const supabase = getSupabaseBrowserClient()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [answerFilters, setAnswerFilters] = useState({}) // questionId → value
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

  const filters = { search, statusFilter, typeFilter, answerFilters, page }
  const { data, isLoading, error } = useQuery({
    queryKey: ['participants', eventId, filters],
    queryFn: async () => {
      let q = supabase
        .from('participants')
        .select('id, first_name, last_name, email, status, answers, created_at, participant_type_id, form_version_id', { count: 'exact' })
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (statusFilter) q = q.eq('status', statusFilter)
      if (typeFilter) q = q.eq('participant_type_id', typeFilter)
      if (search.trim()) {
        // .or() takes raw PostgREST syntax: commas separate clauses and
        // parentheses group them, so both must be stripped from user input
        // or a search like "Smith (guest)" breaks the whole query.
        const s = search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ')
        q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%`)
      }
      for (const [qid, value] of Object.entries(answerFilters)) {
        if (value === '' || value == null) continue
        const question = questions.find((x) => x.id === qid)
        if (question?.type === 'multiselect') {
          q = q.contains('answers', { [qid]: [value] })
        } else if (question?.type === 'checkbox') {
          q = q.contains('answers', { [qid]: value === 'true' })
        } else if (['select', 'radio'].includes(question?.type)) {
          q = q.eq(`answers->>${qid}`, value)
        } else {
          q = q.ilike(`answers->>${qid}`, `%${value}%`)
        }
      }

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
    return `/api/export?${params}`
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
              <th>{t('wizard.firstName')}</th>
              <th>{t('wizard.lastName')}</th>
              <th>{t('wizard.email')}</th>
              <th>{t('console.byType')}</th>
              <th>{t('console.byStatus')}</th>
              {questions.slice(0, 6).map((q) => (
                <th key={q.id}>{lt(q.label, locale)}</th>
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
                    <td key={q.id}>{formatAnswer(p.answers?.[q.id], q, locale)}</td>
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

function formatAnswer(value, question, locale) {
  if (value == null) return ''
  const structured = formatStructuredAnswer(question, value)
  if (structured !== null) return structured
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
