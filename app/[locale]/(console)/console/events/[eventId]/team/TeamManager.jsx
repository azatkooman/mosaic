'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Field, Input, NativeSelect } from '@/components/ui'
import styles from './team.module.css'

const GRANTABLE_LEVELS = ['view', 'scholarship', 'checkin', 'update', 'full']

function levelKey(level) {
  return `level${level.charAt(0).toUpperCase()}${level.slice(1)}`
}

export function TeamManager({ eventId, initialMembers }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('view')
  const [error, setError] = useState(null)
  const [approveLevels, setApproveLevels] = useState({})

  const members = initialMembers.filter((m) => m.role !== 'requested')
  const requests = initialMembers.filter((m) => m.role === 'requested')

  async function run(promise) {
    setError(null)
    const { error } = await promise
    if (error) setError(error.message)
    else router.refresh()
  }

  async function add(e) {
    e.preventDefault()
    await run(
      supabase.rpc('add_event_organizer', {
        p_event_id: eventId,
        p_email: email,
        p_role: role,
      })
    )
    setEmail('')
  }

  function changeLevel(userId, level) {
    run(
      supabase
        .from('event_organizers')
        .update({ role: level })
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
    changeLevel(userId, approveLevels[userId] ?? 'view')
  }

  return (
    <div className={styles.wrap}>
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
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ width: 'auto' }}
        >
          {GRANTABLE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(levelKey(level))}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit">{tCommon('submit')}</Button>
      </form>
      {error && <p className="alert alert-error">{error}</p>}

      {requests.length > 0 && (
        <section aria-label={t('accessRequests')}>
          <h2>{t('accessRequests')}</h2>
          <div className="table-wrap" style={{ maxInlineSize: '40rem' }}>
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
                        value={approveLevels[m.user_id] ?? 'view'}
                        onChange={(e) =>
                          setApproveLevels((prev) => ({
                            ...prev,
                            [m.user_id]: e.target.value,
                          }))
                        }
                        style={{ width: 'auto' }}
                      >
                        {GRANTABLE_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {t(levelKey(level))}
                          </option>
                        ))}
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

      <div className="table-wrap" style={{ maxInlineSize: '40rem' }}>
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
                    value={m.role}
                    onChange={(e) => changeLevel(m.user_id, e.target.value)}
                    style={{ width: 'auto' }}
                  >
                    {GRANTABLE_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(levelKey(level))}
                      </option>
                    ))}
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

      <details>
        <summary>{t('levelLegend')}</summary>
        <ul style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', paddingInlineStart: 'var(--s-5)' }}>
          {GRANTABLE_LEVELS.map((level) => (
            <li key={level}>
              <strong>{t(levelKey(level))}</strong> — {t(`${levelKey(level)}Desc`)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
