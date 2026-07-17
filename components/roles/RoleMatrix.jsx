'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Checkbox, Input } from '@/components/ui'
import { PRIVILEGES, roleLabel, sortRoles } from './roleUtils'

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

  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
      {error && <p className="alert alert-error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('roleName')}</th>
              {PRIVILEGES.map((p) => (
                <th key={p.key} style={{ textAlign: 'center', fontSize: 'var(--text-xs)' }}>
                  {t(p.label)}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortRoles(roles).map((role) => {
              const isPreset = !!role.preset_key
              // roles are editable only in their own matrix: global roles
              // (presets included) in the admin console, event roles on their
              // event's team page
              const editable = eventId ? role.event_id === eventId : role.event_id == null
              const dirty = !!edits[role.id] && Object.keys(edits[role.id] ?? {}).length > 0
              return (
                <tr key={role.id}>
                  <td>
                    <strong>{roleLabel(role, t)}</strong>
                    {(isPreset || (eventId && role.event_id == null)) && (
                      <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                        {isPreset ? t('standardRole') : t('rolesGlobalGroup')}
                      </div>
                    )}
                  </td>
                  {PRIVILEGES.map((p) => (
                    <td key={p.key} style={{ textAlign: 'center' }}>
                      <Checkbox
                        aria-label={`${roleLabel(role, t)} — ${t(p.label)}`}
                        checked={edits[role.id]?.[p.key] ?? role[p.key]}
                        disabled={!editable || p.locked}
                        onCheckedChange={() => toggle(role, p.key)}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
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
              <td style={{ textAlign: 'end' }}>
                <Button size="sm" onClick={create} disabled={!newName.trim()}>
                  {t('createRole')}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
