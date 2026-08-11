'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Link } from '@/lib/i18n/navigation'
import { lt } from '@/lib/i18n/locales'
import { PARTICIPANT_BUCKETS } from '@/lib/event-questions'
import { formatStructuredAnswer } from '@/lib/form-engine/format'
import { formatDateValue, formatEventDate } from '@/lib/dates'
import {
  applyParticipantFilters,
  applyParticipantSort,
  formatRegNo,
  PARTICIPANT_STATUSES,
} from '@/lib/participants-query'
import { useDateFormatPrefs } from '@/components/providers/DateFormatProvider'
import { Badge, Button, Dialog, DropdownMenu, Field, Input, NativeSelect } from '@/components/ui'
import { ParticipantDetail } from './ParticipantDetail'
import styles from './participants.module.css'

const PAGE_SIZE = 50
// A bulk selection can run to 500; the confirm dialog names this many and
// counts the rest rather than growing without bound.
const ARCHIVE_LIST_LIMIT = 12

/** Best available human label for a participant row. */
function participantLabel(p) {
  return (
    [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
    p?.profile_name ||
    formatRegNo(p) ||
    p?.id ||
    ''
  )
}

// Re-exported name kept for the bulk-status control and the per-row menu,
// which still pick exactly one status; the filter above them now takes several.
const STATUSES = PARTICIPANT_STATUSES
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
  buckets,
  definitionByVersion = {},
  canEdit = false,
  canChangeStatus = false,
  canDelete = false,
  // Test hook: the default view is All whenever group forms exist, but a
  // static render cannot click tabs, so tests pin the bucket they assert on.
  initialBucket,
}) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFmt = useDateFormatPrefs()
  const supabase = getSupabaseBrowserClient()
  const queryClient = useQueryClient()

  const [bucket, setBucket] = useState(
    () => initialBucket ?? (buckets.group.versionIds.length > 0 ? 'all' : 'individual')
  )
  const [search, setSearch] = useState('')
  // A list, not a single value: "waitlisted and cancelled, but not confirmed"
  // is a real question, and a <select> cannot ask it. Empty means no filter.
  const [statusFilter, setStatusFilter] = useState([])
  const [typeFilter, setTypeFilter] = useState('')
  const [checkinFilter, setCheckinFilter] = useState('') // '' | 'in' | 'out'
  const [answerFilters, setAnswerFilters] = useState({}) // questionId → value
  const [sort, setSort] = useState({ column: null, dir: 'desc' }) // null = created_at desc
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null) // participant row for the drawer
  const [statusError, setStatusError] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  // Participant rows pending archive confirmation — [] means the dialog is
  // closed. Holding the rows (not just ids) lets the dialog name each target
  // and read their statuses, and survives the list refetching underneath it.
  const [pendingArchive, setPendingArchive] = useState([])
  const [archiveState, setArchiveState] = useState('idle') // idle | working | error
  // Archiving requires an already-cancelled registration (migration 0035), so
  // the dialog can explain and block instead of letting the RPC reject the lot.
  const notCancelled = pendingArchive.filter((p) => p.status !== 'cancelled')

  const typeById = useMemo(
    () => new Map(participantTypes.map((pt) => [pt.id, pt])),
    [participantTypes]
  )
  // Individual and group registrations are separate lists, each carrying the
  // questions of its own forms (lib/event-questions). Switching tabs therefore
  // swaps the whole answer-column set instead of showing one merged table where
  // half the cells are empty because the other mode's form never asked them.
  // The All tab shows both lists merged on the columns they share — no answer
  // columns (they are per-form), plus a Registration kind column instead.
  const active =
    bucket === 'all'
      ? {
          questions: [],
          versionIds: [...buckets.individual.versionIds, ...buckets.group.versionIds],
        }
      : buckets[bucket] ?? buckets.individual
  const questions = active.questions
  // Only worth a tab strip when the event actually runs both kinds of form.
  const hasGroupForms = buckets.group.versionIds.length > 0
  const groupVersions = useMemo(() => new Set(buckets.group.versionIds), [buckets])

  // There are no fixed name/email columns: those are ordinary optional
  // questions, and their columns sat empty whenever an organizer removed them.
  // Deliberately uncapped — the export renders the identical set for this
  // bucket, so the download always matches the view. Wide forms scroll
  // horizontally; each cell clips to one line.
  const shownQuestions = questions

  // Only filterable question kinds get a filter control.
  const filterableQuestions = questions.filter((q) =>
    ['select', 'radio', 'multiselect', 'checkbox', 'text', 'email', 'phone'].includes(q.type)
  )

  // Answer filters and `q:<id>` sorts name questions that exist in one bucket
  // only, so they must be dropped on the way across — a stale filter would
  // otherwise silently empty the other table.
  function switchBucket(next) {
    if (next === bucket) return
    setBucket(next)
    setAnswerFilters({})
    setSort({ column: null, dir: 'desc' })
    setSelectedIds(new Set())
    setPage(0)
  }

  const filters = { bucket, search, statusFilter, typeFilter, answerFilters, checkinFilter, sort, page }
  const { data, isLoading, error } = useQuery({
    queryKey: ['participants', eventId, filters],
    queryFn: async () => {
      let q = supabase
        .from('participants')
        .select(
          'id, first_name, last_name, email, status, answers, created_at, participant_type_id, form_version_id, reg_seq, member_index, profile_name, profile_email, checked_in_at',
          { count: 'exact' }
        )
        .eq('event_id', eventId)
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (checkinFilter === 'in') q = q.not('checked_in_at', 'is', null)
      if (checkinFilter === 'out') q = q.is('checked_in_at', null)

      // Same filter + sort logic the export uses, so the download matches.
      q = applyParticipantFilters(
        q,
        {
          status: statusFilter,
          typeId: typeFilter,
          search,
          answerFilters,
          formVersionIds: active.versionIds,
        },
        questions
      )
      q = applyParticipantSort(q, sort, questions)

      const { data, error, count } = await q
      if (error) throw error
      return { rows: data ?? [], count: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })

  // Unfiltered totals for the tab labels, so an organizer can see there are
  // group registrations even while a filter has emptied the individual list.
  const { data: bucketCounts } = useQuery({
    queryKey: ['participant-bucket-counts', eventId, buckets],
    enabled: hasGroupForms,
    queryFn: async () => {
      const countFor = async (versionIds) => {
        if (!versionIds.length) return 0
        const { count, error } = await supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          // Archived rows are absent from both tables, so the tab counts must
          // exclude them too or the label promises rows the tab cannot show.
          .is('deleted_at', null)
          .in('form_version_id', versionIds)
        if (error) throw error
        return count ?? 0
      }
      const [individual, group] = await Promise.all([
        countFor(buckets.individual.versionIds),
        countFor(buckets.group.versionIds),
      ])
      return { individual, group, all: individual + group }
    },
  })

  const rows = data?.rows ?? []

  function toggleSelectAll() {
    const pageIds = rows.map((r) => r.id)
    const allSelected = pageIds.every((id) => selectedIds.has(id))
    const next = new Set(selectedIds)
    if (allSelected) {
      pageIds.forEach((id) => next.delete(id))
    } else {
      pageIds.forEach((id) => next.add(id))
    }
    setSelectedIds(next)
  }

  function toggleSelectOne(id) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  async function handleBulkStatusChange() {
    if (!bulkStatus || selectedIds.size === 0) return
    setStatusError('')
    setBulkBusy(true)
    try {
      const res = await fetch('/api/participants/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: Array.from(selectedIds), status: bulkStatus }),
      })
      const data = await res.json()
      if (!res.ok || data.failures > 0) {
        if (data.failures > 0) {
          setStatusError(`Failed to update ${data.failures} participant(s).`)
        } else {
          setStatusError(data.error || 'Failed to update status')
        }
      } else {
        setSelectedIds(new Set())
        setBulkStatus('')
      }
    } catch {
      setStatusError('Failed to update status')
    } finally {
      setBulkBusy(false)
      queryClient.invalidateQueries({ queryKey: ['participants', eventId] })
    }
  }

  function handleCopyEmails() {
    const selectedRows = rows.filter((r) => selectedIds.has(r.id))
    // Fall back to the registrant's profile email: the email question is
    // optional, so `email` is null for any form that does not ask for one —
    // without the fallback those rows would silently contribute nothing.
    const emails = [
      ...new Set(selectedRows.map((r) => r.email || r.profile_email).filter(Boolean)),
    ]
    if (emails.length) {
      navigator.clipboard.writeText(emails.join(', '))
      alert(`Copied ${emails.length} email address(es) to clipboard!`)
    }
  }

  async function changeStatus(participantId, status) {
    setStatusError('')
    try {
      const res = await fetch('/api/participants/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: [participantId], status }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatusError(data.error || 'Failed to update status')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['participants', eventId] })
    } catch {
      setStatusError('Failed to update status')
    }
  }

  // Manual check-in toggle — the on-site fallback when a ticket QR cannot be
  // scanned. Same privilege and rules as the scanner (set_participant_checkin
  // re-checks authoritatively).
  async function toggleCheckin(p) {
    setStatusError('')
    const { error } = await supabase.rpc('set_participant_checkin', {
      p_participant_id: p.id,
      p_checked_in: !p.checked_in_at,
    })
    if (error) {
      setStatusError(error.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['participants', eventId] })
  }

  // Archive the confirmed rows. One RPC for a single row and for a bulk
  // selection alike; it cancels each participant first (releasing capacity and
  // promoting from the waitlist) and then hides them from every non-admin.
  async function confirmArchive() {
    if (pendingArchive.length === 0) return
    setArchiveState('working')
    setStatusError('')
    const ids = pendingArchive.map((p) => p.id)
    // Via the route, not the RPC directly: archiving a confirmed participant
    // promotes the next person off the waitlist, and only the server can email
    // them about it. The RPC still re-checks the privilege per participant.
    try {
      const res = await fetch('/api/participants/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: ids }),
      })
      if (!res.ok) {
        setArchiveState('error')
        return
      }
    } catch {
      setArchiveState('error')
      return
    }
    // The rows are gone from every list, so a lingering selection would let a
    // later bulk action act on ids that are no longer shown.
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
    setPendingArchive([])
    setArchiveState('idle')
    queryClient.invalidateQueries({ queryKey: ['participants', eventId] })
    queryClient.invalidateQueries({ queryKey: ['participant-bucket-counts', eventId] })
  }

  function exportUrl(format) {
    // `bucket` makes the download carry the active tab's columns and rows only,
    // so each file has one clean header row instead of a merged superset.
    const params = new URLSearchParams({ eventId, format, locale, bucket })
    // Comma-separated, and a single status still produces `status=confirmed` —
    // the exact URL this used to build, so any saved link keeps working.
    if (statusFilter.length) params.set('status', statusFilter.join(','))
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

  const total = data?.count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className={styles.wrap}>
      {/* Plain buttons on the shared tab styles rather than the Radix Tabs
          primitive: the panel below is one table fed different data, so there
          is no second panel for a Radix trigger's aria-controls to point at. */}
      {/* Actions live above the tab strip, away from the filters. Scanning
          belongs to the event rather than to whichever view is open, and the
          exports moved up here because seven controls could not share one
          line — the CSV button kept wrapping alone. The toolbar below is now
          purely for narrowing the list; these still follow whatever it
          selects. */}
      <div className={styles.pageActions}>
        <a className="btn btn-secondary btn-sm" href={exportUrl('xlsx')}>
          {t('console.exportExcel')}
        </a>
        <a className="btn btn-secondary btn-sm" href={exportUrl('csv')}>
          {t('console.exportCsv')}
        </a>
        {canChangeStatus && (
          <Link className="btn btn-secondary btn-sm" href={`/console/events/${eventId}/checkin`}>
            {t('checkin.scanTickets')}
          </Link>
        )}
      </div>
      {hasGroupForms && (
        <div className="tabs-list" role="tablist" aria-label={t('console.participants')}>
          {['all', ...PARTICIPANT_BUCKETS].map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={bucket === key}
              className="tabs-trigger"
              data-state={bucket === key ? 'active' : 'inactive'}
              onClick={() => switchBucket(key)}
            >
              {t(
                key === 'all'
                  ? 'console.bucketAll'
                  : key === 'group'
                    ? 'console.bucketGroup'
                    : 'console.bucketIndividual'
              )}
              {bucketCounts && ` (${bucketCounts[key]})`}
            </button>
          ))}
        </div>
      )}
      <div className={styles.toolbar}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          style={{ maxInlineSize: '16rem' }}
        />
        <DropdownMenu
          trigger={
            <Button
              variant="secondary"
              size="sm"
              aria-label={t('console.byStatus')}
            >
              {t('console.byStatus')}
              {statusFilter.length > 0 && ` (${statusFilter.length})`}
            </Button>
          }
        >
          {STATUSES.map((s) => (
            <DropdownMenu.CheckboxItem
              key={s}
              checked={statusFilter.includes(s)}
              onCheckedChange={(on) => {
                // Rebuilt from STATUSES rather than appended to, so the list
                // keeps its canonical order however the boxes are ticked —
                // which is what makes the export URL stable and comparable.
                setStatusFilter(
                  STATUSES.filter((x) => (x === s ? on : statusFilter.includes(x)))
                )
                setPage(0)
              }}
            >
              {t(`status.${s}`)}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu>
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

        <NativeSelect
          value={checkinFilter}
          onChange={(e) => { setCheckinFilter(e.target.value); setPage(0) }}
          style={{ width: 'auto' }}
          aria-label={t('console.byCheckin')}
        >
          <option value="">{t('console.byCheckin')}</option>
          <option value="in">{t('console.checkedIn')}</option>
          <option value="out">{t('console.notCheckedIn')}</option>
        </NativeSelect>

        {filterableQuestions.length > 0 && (
          <AnswerFilterPicker
            questions={filterableQuestions}
            locale={locale}
            filters={answerFilters}
            onChange={(next) => { setAnswerFilters(next); setPage(0) }}
            labels={{ add: t('console.filterByAnswer'), clear: t('console.clearFilters') }}
          />
        )}

      </div>
      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <strong>{selectedIds.size} selected</strong>
          {canChangeStatus && (
            <>
              <NativeSelect
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="">Bulk set status...</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </NativeSelect>
              <Button
                variant="secondary"
                size="sm"
                disabled={!bulkStatus || bulkBusy}
                onClick={handleBulkStatusChange}
              >
                {bulkBusy ? t('common.loading') : 'Apply Status'}
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={handleCopyEmails}>
            Copy Emails
          </Button>
          {/* Archiving is tucked behind More actions on purpose: it should be
              rare, and a red Delete sitting beside the status control invited
              being read as a synonym for cancelling. */}
          {canDelete && (
            <DropdownMenu
              trigger={
                <button type="button" className="btn btn-secondary btn-sm">
                  {t('console.moreActions')}
                </button>
              }
            >
              <DropdownMenu.Item
                tone="danger"
                onSelect={() => {
                  setArchiveState('idle')
                  setPendingArchive(rows.filter((r) => selectedIds.has(r.id)))
                }}
              >
                {t('console.archiveParticipant')}
              </DropdownMenu.Item>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Deselect All
          </Button>
        </div>
      )}

      {statusError && (
        <p className="alert alert-error" role="alert">{statusError}</p>
      )}

      {shownQuestions.length > 0 && (
        <p className={styles.stackHint}>{t('console.tapRegNoForAnswers')}</p>
      )}

      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              {/* Bulk-select stays the leftmost column; Reg. # follows it as
                  the row's identifier and view link. */}
              <th style={{ width: '2.5rem' }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                  onChange={toggleSelectAll}
                  aria-label={t('console.ariaSelectAll')}
                />
              </th>
              <SortHeader label={t('console.regNo')} column="reg_no" sort={sort} onSort={toggleSort} />
              {bucket === 'all' && <th>{t('console.registrationKind')}</th>}
              {shownQuestions.map((q) => (
                <SortHeader key={q.id} label={lt(q.label, locale)} column={`q:${q.id}`} sort={sort} onSort={toggleSort} />
              ))}
              <SortHeader label={t('console.byType')} column="type" sort={sort} onSort={toggleSort} />
              <SortHeader label={t('console.byStatus')} column="status" sort={sort} onSort={toggleSort} />
              <th>{t('console.checkedIn')}</th>
              <SortHeader label={t('console.profileName')} column="profile_name" sort={sort} onSort={toggleSort} />
              <SortHeader label={t('console.profileEmail')} column="profile_email" sort={sort} onSort={toggleSort} />
              {/* Actions holds only the status control now that Reg. # is the
                  view link — so the column disappears entirely for roles that
                  cannot change status, rather than sitting empty. Archiving
                  lives in the bulk bar's More-actions menu, deliberately not
                  here: a per-row delete beside a per-row status control read as
                  two ways to do the same thing. */}
              {canChangeStatus && <th>{t('common.actions')}</th>}
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
                  <td data-cell="select">
                    {/* Identified by Reg. #, not by name — a form need not ask
                        for a name at all. */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelectOne(p.id)}
                      aria-label={`Select ${formatRegNo(p)}`}
                    />
                  </td>
                  <td data-cell="title">
                    {/* The Reg. # is the row's view control — it replaced a
                        separate "View" button in the actions cell. */}
                    <button
                      className={styles.regLink}
                      onClick={() => setSelected(p)}
                      title={t('console.viewDetail')}
                    >
                      {formatRegNo(p) || '—'}
                    </button>
                  </td>
                  {bucket === 'all' && (
                    <td data-label={t('console.registrationKind')}>
                      {t(
                        groupVersions.has(p.form_version_id)
                          ? 'console.kindGroup'
                          : 'console.kindIndividual'
                      )}
                    </td>
                  )}
                  {/* One column per form question. A 20-question form makes ~27
                      columns, so the stacked card drops them and points at the
                      detail drawer, which already shows every answer. */}
                  {shownQuestions.map((q) => (
                    <Cell
                      key={q.id}
                      cell="answer"
                      label={lt(q.label, locale)}
                      value={formatAnswer(p.answers?.[q.id], q, locale, dateFmt)}
                    />
                  ))}
                  <td data-label={t('console.byType')}>
                    {lt(typeById.get(p.participant_type_id)?.name, locale)}
                  </td>
                  <td data-label={t('console.byStatus')}>
                    <Badge tone={p.status}>{t(`status.${p.status}`)}</Badge>
                  </td>
                  <td data-label={t('console.checkedIn')}>
                    {canChangeStatus ? (
                      <input
                        type="checkbox"
                        checked={Boolean(p.checked_in_at)}
                        // Only confirmed participants can be checked IN;
                        // unchecking (undo) is always allowed.
                        disabled={!p.checked_in_at && p.status !== 'confirmed'}
                        onChange={() => toggleCheckin(p)}
                        aria-label={t('console.checkedIn')}
                        title={
                          p.checked_in_at
                            ? formatEventDate(p.checked_in_at, undefined, locale, dateFmt)
                            : undefined
                        }
                      />
                    ) : p.checked_in_at ? (
                      '✓'
                    ) : (
                      '—'
                    )}
                  </td>
                  <Cell label={t('console.profileName')} value={p.profile_name} />
                  <Cell label={t('console.profileEmail')} value={p.profile_email} />
                  {canChangeStatus && (
                    <td data-cell="actions">
                      <div className={styles.rowActions}>
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
                      </div>
                    </td>
                  )}
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

      {/* Archive confirmation. Mirrors DeleteEventButton: a red action, a
          plain statement of what survives, and no way to trigger it by
          accident. */}
      <Dialog
        open={pendingArchive.length > 0}
        onOpenChange={(next) => {
          if (!next) {
            setPendingArchive([])
            setArchiveState('idle')
          }
        }}
        title={
          pendingArchive.length === 1
            ? t('console.archiveParticipantTitle', {
                name: participantLabel(pendingArchive[0]),
              })
            : t('console.archiveParticipantsTitle', { count: pendingArchive.length })
        }
      >
        {/* Only cancelled registrations can be archived (migration 0035 enforces
            it). Say so up front and block, rather than letting the RPC reject
            the batch — and list the offenders with their status so the reason
            is visible rather than described. */}
        {notCancelled.length > 0 ? (
          <p className="alert alert-error" role="alert" style={{ marginBlock: 'var(--s-3)' }}>
            {t('console.archiveNeedsCancelled')}
          </p>
        ) : (
          <p style={{ color: 'var(--ink-soft)', marginBlock: 'var(--s-3) var(--s-4)' }}>
            {t('console.archiveParticipantWarning')}
          </p>
        )}

        {/* What is actually about to happen, by name — so a mis-selection is
            caught here rather than after the fact. Capped: a 500-row selection
            should not produce a 500-line dialog. */}
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 var(--s-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-2)',
          }}
        >
          {(notCancelled.length > 0 ? notCancelled : pendingArchive)
            .slice(0, ARCHIVE_LIST_LIMIT)
            .map((p) => (
              <li
                key={p.id}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}
              >
                <span>{participantLabel(p)}</span>
                <Badge tone={p.status}>{t(`status.${p.status}`)}</Badge>
              </li>
            ))}
          {(notCancelled.length > 0 ? notCancelled : pendingArchive).length >
            ARCHIVE_LIST_LIMIT && (
            <li className={styles.muted}>
              {t('console.andNMore', {
                count:
                  (notCancelled.length > 0 ? notCancelled : pendingArchive).length -
                  ARCHIVE_LIST_LIMIT,
              })}
            </li>
          )}
        </ul>

        {archiveState === 'error' && (
          <p className="alert alert-error" role="alert">
            {t('console.archiveParticipantError')}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {t('common.cancel')}
            </Button>
          </Dialog.Close>
          <Button
            variant="danger"
            onClick={confirmArchive}
            disabled={archiveState === 'working' || notCancelled.length > 0}
          >
            {archiveState === 'working'
              ? t('console.archiving')
              : t('console.archiveParticipant')}
          </Button>
        </div>
      </Dialog>

      {selected && (
        <ParticipantDetail
          audience="admin"
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

/**
 * A body cell that clips overlong content to a single line ending in "…".
 * The full text stays reachable as the title tooltip (and in the export).
 */
function Cell({ value, label, cell }) {
  const text = value == null || value === '' ? '' : String(value)
  return (
    <td className={styles.clipCell} data-label={label} data-cell={cell}>
      <span className={styles.clip} title={text || undefined}>
        {text || '—'}
      </span>
    </td>
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
        <span className={styles.clip}>{label}</span>
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
