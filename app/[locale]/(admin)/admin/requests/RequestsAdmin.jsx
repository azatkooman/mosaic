'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { Button, NativeSelect } from '@/components/ui'
import { roleLabel, sortRoles } from '@/components/roles/roleUtils'
import styles from '../admin-shell.module.css'

export function RequestsAdmin({ requests, eventRoles }) {
  const t = useTranslations('console')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [error, setError] = useState(null)
  const [approveLevels, setApproveLevels] = useState({}) // request key -> role id

  const assignableRoles = sortRoles(eventRoles)
  const defaultRoleId = assignableRoles.find((r) => r.preset_key === 'view')?.id

  async function run(promise) {
    setError(null)
    const { error } = await promise
    if (error) setError(error.message)
    else router.refresh()
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

  return (
    <div className={styles.page}>
      <h1 className="page-title">{t('accessRequests')}</h1>
      {error && <p className="alert alert-error">{error}</p>}
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
    </div>
  )
}
