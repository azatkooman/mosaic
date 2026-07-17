'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { Badge, Button, Input, NativeSelect } from '@/components/ui'
import { RoleMatrix } from '@/components/roles/RoleMatrix'
import { roleLabel, sortRoles } from '@/components/roles/roleUtils'
import styles from './admin.module.css'

export function AdminConsole({
  users,
  requests,
  roleRequests,
  eventRoles,
  orgId,
  currentUserId,
  isSuperAdmin,
}) {
  const t = useTranslations('console')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [approveLevels, setApproveLevels] = useState({}) // request key -> role id
  const [approveRoles, setApproveRoles] = useState({}) // user id -> global role

  const assignableRoles = sortRoles(eventRoles)
  const defaultRoleId = assignableRoles.find((r) => r.preset_key === 'view')?.id

  const q = search.trim().toLowerCase()
  const visibleUsers = q
    ? users.filter(
        (u) =>
          (u.full_name ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
      )
    : users

  async function run(promise) {
    setError(null)
    const { error } = await promise
    if (error) setError(error.message)
    else router.refresh()
  }

  function changeGlobalRole(user, role) {
    if (role === 'none') {
      run(supabase.rpc('revoke_global_role', { p_user_id: user.id }))
    } else {
      run(supabase.rpc('grant_global_role', { p_email: user.email, p_role: role }))
    }
  }

  function transferSuperAdmin(user) {
    const name = user.full_name || user.email
    if (window.confirm(t('transferConfirm', { name }))) {
      run(supabase.rpc('transfer_super_admin', { p_email: user.email }))
    }
  }

  function approve(request) {
    const key = `${request.event_id}:${request.user_id}`
    const roleId = approveLevels[key] ?? defaultRoleId
    if (!roleId) return
    run(
      supabase
        .from('event_organizers')
        .update({ role_id: roleId, status: 'active' })
        .eq('event_id', request.event_id)
        .eq('user_id', request.user_id)
        .eq('status', 'requested')
    )
  }

  function deny(request) {
    run(
      supabase
        .from('event_organizers')
        .delete()
        .eq('event_id', request.event_id)
        .eq('user_id', request.user_id)
        .eq('status', 'requested')
    )
  }

  function approveRole(request) {
    run(
      supabase.rpc('approve_role_request', {
        p_user_id: request.user_id,
        p_role: approveRoles[request.user_id] ?? 'organizer',
      })
    )
  }

  function denyRole(request) {
    run(supabase.from('role_requests').delete().eq('user_id', request.user_id))
  }

  return (
    <div className={styles.wrap}>
      <h1 className="page-title">{t('adminTitle')}</h1>
      {error && <p className="alert alert-error">{error}</p>}

      <section className={styles.section} aria-label={t('accessRequests')}>
        <h2>{t('accessRequests')}</h2>
        {requests.length === 0 ? (
          <p className="alert alert-info">{t('noRequests')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {requests.map((r) => {
                  const key = `${r.event_id}:${r.user_id}`
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{r.profiles?.full_name || '—'}</strong>
                        <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                          {r.profiles?.email}
                        </div>
                      </td>
                      <td>{lt(r.events?.name, locale, r.events?.default_locale)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <NativeSelect
                            aria-label={t('accessLevel')}
                            value={approveLevels[key] ?? defaultRoleId ?? ''}
                            onChange={(e) =>
                              setApproveLevels((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            style={{ width: 'auto' }}
                          >
                            {assignableRoles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {roleLabel(role, t)}
                              </option>
                            ))}
                          </NativeSelect>
                          <Button size="sm" onClick={() => approve(r)}>
                            {t('approve')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deny(r)}>
                            {t('deny')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label={t('roleRequests')}>
        <h2>{t('roleRequests')}</h2>
        {roleRequests.length === 0 ? (
          <p className="alert alert-info">{t('noRoleRequests')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {roleRequests.map((r) => (
                  <tr key={r.user_id}>
                    <td>
                      <strong>{r.profiles?.full_name || '—'}</strong>
                      <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                        {r.profiles?.email}
                      </div>
                    </td>
                    <td style={{ color: 'var(--ink-soft)' }}>{r.message || '—'}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <NativeSelect
                          aria-label={t('globalRoleLabel')}
                          value={approveRoles[r.user_id] ?? 'organizer'}
                          onChange={(e) =>
                            setApproveRoles((prev) => ({ ...prev, [r.user_id]: e.target.value }))
                          }
                          style={{ width: 'auto' }}
                        >
                          <option value="organizer">{t('roleGlobalOrganizer')}</option>
                          <option value="admin">{t('roleAdmin')}</option>
                        </NativeSelect>
                        <Button size="sm" onClick={() => approveRole(r)}>
                          {t('approve')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => denyRole(r)}>
                          {t('deny')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label={t('roles')}>
        <div>
          <h2>{t('roles')}</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
            {t('rolesHelp')}
          </p>
        </div>
        <RoleMatrix roles={eventRoles} orgId={orgId} eventId={null} />
      </section>

      <section className={styles.section} aria-label={t('adminUsers')}>
        <div className={styles.sectionHead}>
          <div>
            <h2>{t('adminUsers')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
              {t('adminUsersHelp')}
            </p>
          </div>
          <div className={styles.searchBox}>
            <Input
              type="search"
              placeholder={t('searchUsers')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('searchUsers')}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminUser')}</th>
                <th>{t('globalRoleLabel')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name || '—'}</strong>
                    <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                      {user.email}
                    </div>
                  </td>
                  <td>
                    {user.role === 'super_admin' ? (
                      <Badge tone="published">{t('roleSuperAdmin')}</Badge>
                    ) : (
                      <NativeSelect
                        aria-label={t('globalRoleLabel')}
                        value={user.role ?? 'none'}
                        onChange={(e) => changeGlobalRole(user, e.target.value)}
                        style={{ width: 'auto' }}
                      >
                        <option value="none">{t('roleNone')}</option>
                        <option value="organizer">{t('roleGlobalOrganizer')}</option>
                        <option value="admin">{t('roleAdmin')}</option>
                      </NativeSelect>
                    )}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {isSuperAdmin && user.id !== currentUserId && user.role !== 'super_admin' && (
                        <Button variant="ghost" size="sm" onClick={() => transferSuperAdmin(user)}>
                          {t('makeSuperAdmin')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
