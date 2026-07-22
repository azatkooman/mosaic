'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge, Button, Input, NativeSelect } from '@/components/ui'
import styles from '../admin-shell.module.css'

export function UsersAdmin({ users, currentUserId, isSuperAdmin }) {
  const t = useTranslations('console')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('organizer')

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

  async function addByEmail(e) {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setError(null)
    setNotice(null)
    const { error } = await supabase.rpc('grant_global_role', {
      p_email: email,
      p_role: inviteRole,
    })
    if (error) {
      setError(error.message)
      return
    }
    // Fire-and-forget notification email — don't block the UI on it.
    fetch('/api/notify-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: inviteRole }),
    }).catch(() => {})
    setInviteEmail('')
    setNotice(t('roleGranted'))
    router.refresh()
  }

  async function changeGlobalRole(user, role) {
    if (role === 'none') {
      run(supabase.rpc('revoke_global_role', { p_user_id: user.id }))
    } else {
      setError(null)
      const { error } = await supabase.rpc('grant_global_role', {
        p_email: user.email,
        p_role: role,
      })
      if (error) {
        setError(error.message)
      } else {
        // Fire-and-forget notification email — don't block the UI on it.
        fetch('/api/notify-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, role }),
        }).catch(() => {})
        router.refresh()
      }
    }
  }

  function transferSuperAdmin(user) {
    const name = user.full_name || user.email
    if (window.confirm(t('transferConfirm', { name }))) {
      run(supabase.rpc('transfer_super_admin', { p_email: user.email }))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className="page-title">{t('adminUsers')}</h1>
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
      {error && <p className="alert alert-error">{error}</p>}
      {notice && <p className="alert alert-info">{notice}</p>}
      <form onSubmit={addByEmail} className={styles.inviteRow} aria-label={t('addByEmail')}>
        <Input
          type="email"
          required
          placeholder={t('addByEmail')}
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          aria-label={t('addByEmail')}
        />
        <NativeSelect
          aria-label={t('globalRoleLabel')}
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="organizer">{t('roleGlobalOrganizer')}</option>
          <option value="admin">{t('roleAdmin')}</option>
        </NativeSelect>
        <Button type="submit" size="sm">
          {t('add')}
        </Button>
        <p className={styles.inviteHelp}>{t('addByEmailHelp')}</p>
      </form>
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
    </div>
  )
}
