'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Field, Input, NativeSelect } from '@/components/ui'
import { RoleMatrix } from '@/components/roles/RoleMatrix'
import { roleLabel, sortRoles } from '@/components/roles/roleUtils'
import styles from './team.module.css'

export function TeamManager({ eventId, eventSlug, orgId, initialMembers, roles }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(eventSlug)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (permissions/insecure context) — ignore
    }
  }

  const assignableRoles = sortRoles(roles)
  const defaultRoleId = assignableRoles.find((r) => r.preset_key === 'view')?.id

  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(defaultRoleId ?? '')
  const [error, setError] = useState(null)
  const [approveRoleIds, setApproveRoleIds] = useState({})

  const members = initialMembers.filter((m) => m.status === 'active')
  const requests = initialMembers.filter((m) => m.status === 'requested')

  async function run(promise) {
    setError(null)
    const { error } = await promise
    if (error) setError(error.message)
    else router.refresh()
  }

  function roleOptions() {
    return assignableRoles.map((role) => (
      <option key={role.id} value={role.id}>
        {roleLabel(role, t)}
        {role.event_id ? ` (${t('rolesEventGroup')})` : ''}
      </option>
    ))
  }

  async function add(e) {
    e.preventDefault()
    await run(
      supabase.rpc('add_event_organizer', {
        p_event_id: eventId,
        p_email: email,
        p_role_id: roleId,
      })
    )
    setEmail('')
  }

  function changeRole(userId, newRoleId) {
    run(
      supabase
        .from('event_organizers')
        .update({ role_id: newRoleId, status: 'active' })
        .eq('event_id', eventId)
        .eq('user_id', userId)
    )
  }

  function remove(userId) {
    run(
      supabase
        .from('event_organizers')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)
    )
  }

  function approve(userId) {
    changeRole(userId, approveRoleIds[userId] ?? defaultRoleId)
  }

  return (
    <div className={styles.wrap}>
      {eventSlug && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--ink-soft)' }}>{t('eventCode')}:</span>
          <code>{eventSlug}</code>
          <Button variant="ghost" size="sm" onClick={copyCode}>
            {copied ? t('copied') : t('copy')}
          </Button>
          <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
            {t('eventCodeHelp')}
          </span>
        </p>
      )}

      <form onSubmit={add} className={styles.addRow}>
        <Field label={t('inviteByEmail')}>
          {({ id }) => (
            <Input
              id={id}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <NativeSelect
          aria-label={t('accessLevel')}
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          style={{ width: 'auto' }}
        >
          {roleOptions()}
        </NativeSelect>
        <Button type="submit">{tCommon('submit')}</Button>
      </form>
      {error && <p className="alert alert-error">{error}</p>}

      {requests.length > 0 && (
        <section aria-label={t('accessRequests')}>
          <h2>{t('accessRequests')}</h2>
          <div className="table-wrap" style={{ maxInlineSize: '44rem' }}>
            <table className="table">
              <tbody>
                {requests.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <strong>{m.profiles?.full_name || '—'}</strong>
                      <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                        {m.profiles?.email}
                      </div>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      <NativeSelect
                        aria-label={t('accessLevel')}
                        value={approveRoleIds[m.user_id] ?? defaultRoleId ?? ''}
                        onChange={(e) =>
                          setApproveRoleIds((prev) => ({
                            ...prev,
                            [m.user_id]: e.target.value,
                          }))
                        }
                        style={{ width: 'auto' }}
                      >
                        {roleOptions()}
                      </NativeSelect>{' '}
                      <Button size="sm" onClick={() => approve(m.user_id)}>
                        {t('approve')}
                      </Button>{' '}
                      <Button variant="ghost" size="sm" onClick={() => remove(m.user_id)}>
                        {t('deny')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="table-wrap" style={{ maxInlineSize: '44rem' }}>
        <table className="table">
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <strong>{m.profiles?.full_name || '—'}</strong>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                    {m.profiles?.email}
                  </div>
                </td>
                <td>
                  <NativeSelect
                    aria-label={t('accessLevel')}
                    value={m.role_id ?? ''}
                    onChange={(e) => changeRole(m.user_id, e.target.value)}
                    style={{ width: 'auto' }}
                  >
                    {roleOptions()}
                  </NativeSelect>
                </td>
                <td style={{ textAlign: 'end' }}>
                  <Button variant="ghost" size="sm" onClick={() => remove(m.user_id)}>
                    {t('remove')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-label={t('roles')}>
        <h2>{t('customRolesEvent')}</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
          {t('customRolesEventHelp')}
        </p>
        <RoleMatrix roles={roles} orgId={orgId} eventId={eventId} />
      </section>
    </div>
  )
}
