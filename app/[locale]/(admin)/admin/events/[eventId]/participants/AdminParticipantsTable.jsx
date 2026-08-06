'use client'

import { useMemo, useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge, Button, Checkbox, Dialog } from '@/components/ui'

/**
 * Read-only participants list with client-side sorting, plus the one write
 * this section allows: permanent deletion.
 *
 * Sorting is in the browser, not the database, because this list is not paged
 * — the server already sent every row for the event, so re-querying to reorder
 * would be a round trip for nothing. That is the opposite of the console's
 * table, which pages and therefore must sort in Postgres.
 *
 * Rows arrive pre-shaped (labels resolved, answers formatted) so this stays
 * presentational and the server keeps the i18n and locale work.
 *
 * Eligibility for deletion mirrors purge_participants (migration 0036): on an
 * archived event anything may go; on a live one only a cancelled registration
 * may. The RPC re-checks, so this is the explanation, not the enforcement.
 */

// Comparator inputs per column. Everything falls back to a string compare;
// numeric and boolean columns say so, since '10' < '9' as text.
const COLUMNS = [
  { key: 'regNo', labelKey: 'regNo', type: 'number' },
  { key: 'name', labelKey: 'name' },
  { key: 'typeName', labelKey: 'type' },
  { key: 'status', labelKey: 'status' },
  { key: 'archived', labelKey: 'archived', type: 'boolean' },
  { key: 'profileName', labelKey: 'profileName' },
  { key: 'profileEmail', labelKey: 'profileEmail' },
  { key: 'createdAt', labelKey: 'registeredAt', type: 'number' },
]

function compare(a, b, key, type) {
  if (type === 'number') return (a[key] ?? 0) - (b[key] ?? 0)
  if (type === 'boolean') return (a[key] ? 1 : 0) - (b[key] ? 1 : 0)
  return String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
}

export function AdminParticipantsTable({ rows, labels, eventArchived = false }) {
  // Reg. # ascending matches the order the server sent and the console's own
  // default reading order.
  const [sort, setSort] = useState({ key: 'regNo', dir: 'asc' })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [confirming, setConfirming] = useState(false)
  const [state, setState] = useState('idle') // idle | working | error
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  // On an archived event the record is already out of circulation, so any row
  // may go. On a live one, only a cancelled registration may — purging must
  // not become a shortcut past cancelling.
  const eligible = (r) => eventArchived || r.status === 'cancelled'

  const selected = rows.filter((r) => selectedIds.has(r.id))
  const blocked = selected.filter((r) => !eligible(r))

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0]
    const factor = sort.dir === 'desc' ? -1 : 1
    // Copy first: Array#sort mutates, and `rows` is a prop.
    return [...rows].sort((a, b) => {
      const primary = compare(a, b, col.key, col.type) * factor
      // Reg. # is the tiebreaker so equal keys keep a stable, meaningful order
      // rather than whatever the engine happens to do.
      return primary !== 0 ? primary : compare(a, b, 'regNo', 'number')
    })
  }, [rows, sort])

  function toggle(key) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : // First click on a new column: descending for the two columns whose
          // interesting end is the top (newest registrations, archived rows).
          { key, dir: key === 'createdAt' || key === 'archived' ? 'desc' : 'asc' }
    )
  }

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const ids = sorted.map((r) => r.id)
    setSelectedIds((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)))
  }

  async function purge() {
    setState('working')
    const { error } = await supabase.rpc('purge_participants', {
      p_participant_ids: selected.map((r) => r.id),
    })
    if (error) {
      setState('error')
      return
    }
    setSelectedIds(new Set())
    setConfirming(false)
    setState('idle')
    // Server component: refetch rather than mutating a local copy, so the
    // summary line and every other tab agree with the database.
    router.refresh()
  }

  const allSelected = sorted.length > 0 && sorted.every((r) => selectedIds.has(r.id))

  return (
    <>
      {selected.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            flexWrap: 'wrap',
            padding: 'var(--s-3) var(--s-4)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            marginBlockEnd: 'var(--s-3)',
          }}
        >
          <strong>{labels.nSelected.replace('{count}', selected.length)}</strong>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setState('idle')
              setConfirming(true)
            }}
          >
            {labels.deletePermanently}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            {labels.deselectAll}
          </Button>
        </div>
      )}

      <div className="table-wrap table-cards">
      <table className="table">
        <thead>
          <tr>
            <th>
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label={labels.selectAll}
              />
            </th>
            {COLUMNS.map((col) => {
              const active = sort.key === col.key
              return (
                <th key={col.key} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggle(col.key)}
                    style={{ paddingInline: '0.25rem', font: 'inherit' }}
                  >
                    {labels[col.labelKey]}
                    <span aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
                      {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td>
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => toggleOne(p.id)}
                  aria-label={`${labels.select}: ${p.name || p.regSeq || p.id}`}
                />
              </td>
              <td data-cell="title">{p.regNo ? `${p.regSeq}.${p.memberIndex}` : '—'}</td>
              <td data-label={labels.name}>
                <div>
                  {p.name || '—'}
                  {p.email && <div style={{ color: 'var(--ink-soft)' }}>{p.email}</div>}
                </div>
                {p.answers.length > 0 && (
                  <details style={{ marginBlockStart: 'var(--s-1)' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--ink-soft)' }}>
                      {labels.answers} ({p.answers.length})
                    </summary>
                    <dl style={{ margin: 'var(--s-2) 0 0' }}>
                      {p.answers.map((a) => (
                        <div key={a.id} style={{ marginBlockEnd: 'var(--s-1)' }}>
                          <dt style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{a.label}</dt>
                          <dd style={{ margin: 0, overflowWrap: 'break-word' }}>{a.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </td>
              <td data-label={labels.type}>{p.typeName || '—'}</td>
              <td data-label={labels.status}>
                <Badge tone={p.status}>{p.statusLabel}</Badge>
              </td>
              <td data-label={labels.archived}>
                {/* The distinction this page exists for: archived rows are
                    invisible to the organizer and to the registrant. */}
                {p.archived ? <Badge tone="archived">{labels.archived}</Badge> : '—'}
              </td>
              <td data-label={labels.profileName}>{p.profileName || '—'}</td>
              <td data-label={labels.profileEmail}>{p.profileEmail || '—'}</td>
              <td data-label={labels.registeredAt}>{p.createdAtLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next) {
            setConfirming(false)
            setState('idle')
          }
        }}
        title={labels.purgeTitle.replace('{count}', selected.length)}
      >
        {blocked.length > 0 ? (
          <p className="alert alert-error" role="alert" style={{ marginBlock: 'var(--s-3)' }}>
            {labels.purgeNeedsCancelled}
          </p>
        ) : (
          <p className="alert alert-error" role="alert" style={{ marginBlock: 'var(--s-3)' }}>
            {labels.purgeWarning}
          </p>
        )}

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
          {(blocked.length > 0 ? blocked : selected).slice(0, 12).map((p) => (
            <li
              key={p.id}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}
            >
              <span>{p.name || `${p.regSeq}.${p.memberIndex}`}</span>
              <Badge tone={p.status}>{p.statusLabel}</Badge>
              {p.archived && <Badge tone="archived">{labels.archived}</Badge>}
            </li>
          ))}
          {(blocked.length > 0 ? blocked : selected).length > 12 && (
            <li style={{ color: 'var(--ink-soft)' }}>
              {labels.andNMore.replace(
                '{count}',
                (blocked.length > 0 ? blocked : selected).length - 12
              )}
            </li>
          )}
        </ul>

        {state === 'error' && (
          <p className="alert alert-error" role="alert">
            {labels.purgeError}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {labels.cancel}
            </Button>
          </Dialog.Close>
          <Button
            variant="danger"
            onClick={purge}
            disabled={state === 'working' || blocked.length > 0}
          >
            {state === 'working' ? labels.deleting : labels.deletePermanently}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
