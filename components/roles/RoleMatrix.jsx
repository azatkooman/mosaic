'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Checkbox, Input } from '@/components/ui'
import { PRIVILEGES, roleLabel, sortRoles } from './roleUtils'
import styles from './RoleMatrix.module.css'

const EMPTY_DRAFT = Object.fromEntries(PRIVILEGES.map((p) => [p.key, !!p.locked]))

/**
 * Permission matrix: one row per role, one checkbox column per privilege.
 * Preset rows are read-only; custom rows are editable in place. `eventId`
 * scopes newly created roles (null = global, admins only — RLS enforces).
 */
export function RoleMatrix({ roles, orgId, eventId = null }) {
  const t = useTranslations('console')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [error, setError] = useState(null)
  const [edits, setEdits] = useState({}) // role id -> {priv: bool}
  const [newName, setNewName] = useState('')
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  async function run(promise) {
    setError(null)
    const { error } = await promise
    if (error) {
      setError(error.code === '23503' ? t('roleInUse') : error.message)
      return false
    }
    router.refresh()
    return true
  }

  function toggle(role, priv) {
    setEdits((prev) => ({
      ...prev,
      [role.id]: {
        ...(prev[role.id] ?? {}),
        [priv]: !(prev[role.id]?.[priv] ?? role[priv]),
      },
    }))
  }

  async function save(role) {
    const changed = edits[role.id]
    if (!changed) return
    const ok = await run(supabase.from('event_roles').update(changed).eq('id', role.id))
    if (ok) setEdits((prev) => ({ ...prev, [role.id]: undefined }))
  }

  function remove(role) {
    run(supabase.from('event_roles').delete().eq('id', role.id))
  }

  async function create(e) {
    e.preventDefault()
    const ok = await run(
      supabase.from('event_roles').insert({
        org_id: orgId,
        event_id: eventId,
        name: newName.trim(),
        ...draft,
      })
    )
    if (ok) {
      setNewName('')
      setDraft(EMPTY_DRAFT)
    }
  }

  // value shown for a role's privilege, accounting for unsaved edits
  const isChecked = (role, key) => edits[role.id]?.[key] ?? role[key]

  const rows = sortRoles(roles).map((role) => {
    const isPreset = !!role.preset_key
    // roles are editable only in their own matrix: global roles (presets
    // included) in the admin console, event roles on their event's team page
    const editable = eventId ? role.event_id === eventId : role.event_id == null
    const dirty = !!edits[role.id] && Object.keys(edits[role.id] ?? {}).length > 0
    const subtitle =
      isPreset ? t('standardRole') : eventId && role.event_id == null ? t('rolesGlobalGroup') : null
    return { role, isPreset, editable, dirty, subtitle }
  })

  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
      {error && <p className="alert alert-error">{error}</p>}

      {/* Wide screens: full matrix */}
      <div className={`table-wrap ${styles.tableView}`} style={{ overflowX: 'auto' }}>
        <table className="table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            {PRIVILEGES.map((p) => (
              <col key={p.key} style={{ width: `${70 / PRIVILEGES.length}%` }} />
            ))}
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('roleName')}</th>
              {PRIVILEGES.map((p) => (
                <th key={p.key} style={{ textAlign: 'center', fontSize: 'var(--text-xs)', whiteSpace: 'normal', lineHeight: '1.25', overflowWrap: 'break-word', letterSpacing: 0, padding: 'var(--s-3) var(--s-1)' }}>
                  {t(p.label)}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ role, isPreset, editable, dirty, subtitle }) => {
              return (
                <tr key={role.id}>
                  <td>
                    <strong>{roleLabel(role, t)}</strong>
                    {subtitle && (
                      <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                        {subtitle}
                      </div>
                    )}
                  </td>
                  {PRIVILEGES.map((p) => (
                    <td key={p.key} style={{ textAlign: 'center' }}>
                      <Checkbox
                        aria-label={`${roleLabel(role, t)} — ${t(p.label)}`}
                        checked={isChecked(role, p.key)}
                        disabled={!editable || p.locked}
                        onCheckedChange={() => toggle(role, p.key)}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {editable && dirty && (
                      <Button size="sm" onClick={() => save(role)}>
                        {t('saveRole')}
                      </Button>
                    )}{' '}
                    {editable && !isPreset && (
                      <Button variant="ghost" size="sm" onClick={() => remove(role)}>
                        {t('deleteRole')}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr>
              <td>
                <Input
                  aria-label={t('roleName')}
                  placeholder={t('newRole')}
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ minInlineSize: '9rem' }}
                />
              </td>
              {PRIVILEGES.map((p) => (
                <td key={p.key} style={{ textAlign: 'center' }}>
                  <Checkbox
                    aria-label={`${t('newRole')} — ${t(p.label)}`}
                    checked={draft[p.key]}
                    disabled={!!p.locked}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, [p.key]: !!v }))}
                  />
                </td>
              ))}
              <td style={{ textAlign: 'center' }}>
                <Button size="sm" onClick={create} disabled={!newName.trim()}>
                  {t('createRole')}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Narrow screens: one card per role, privileges as a toggle list */}
      <div className={styles.cardView}>
        {rows.map(({ role, isPreset, editable, dirty, subtitle }) => (
          <div key={role.id} className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <strong>{roleLabel(role, t)}</strong>
                {subtitle && <div className={styles.sub}>{subtitle}</div>}
              </div>
              {editable && (dirty || !isPreset) && (
                <div className={styles.cardActions}>
                  {dirty && (
                    <Button size="sm" onClick={() => save(role)}>
                      {t('saveRole')}
                    </Button>
                  )}
                  {!isPreset && (
                    <Button variant="ghost" size="sm" onClick={() => remove(role)}>
                      {t('deleteRole')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className={styles.privList}>
              {PRIVILEGES.map((p) => {
                const disabled = !editable || p.locked
                const checked = isChecked(role, p.key)
                const rowId = `${role.id}-${p.key}`
                return (
                  <label
                    key={p.key}
                    className="choice-row"
                    htmlFor={rowId}
                    data-checked={checked || undefined}
                    data-disabled={disabled || undefined}
                  >
                    <Checkbox
                      id={rowId}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggle(role, p.key)}
                    />
                    <span>{t(p.label)}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        {/* Create a new role */}
        <div className={styles.card}>
          <Input
            aria-label={t('roleName')}
            placeholder={t('newRole')}
            value={newName}
            maxLength={60}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className={styles.privList}>
            {PRIVILEGES.map((p) => {
              const rowId = `new-${p.key}`
              return (
                <label
                  key={p.key}
                  className="choice-row"
                  htmlFor={rowId}
                  data-checked={draft[p.key] || undefined}
                  data-disabled={p.locked || undefined}
                >
                  <Checkbox
                    id={rowId}
                    checked={draft[p.key]}
                    disabled={!!p.locked}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, [p.key]: !!v }))}
                  />
                  <span>{t(p.label)}</span>
                </label>
              )
            })}
          </div>
          <div>
            <Button size="sm" onClick={create} disabled={!newName.trim()}>
              {t('createRole')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
