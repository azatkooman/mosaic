'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge, Button, Field, Input, NativeSelect } from '@/components/ui'
import styles from './team.module.css'

// The three roles an event has (migration 0053). Owner is the creator's and is
// never handed out, so it is not offered here — it appears only as a label on
// the row that already holds it.
const INVITABLE = ['co_organizer', 'viewer']

/**
 * Who can work on this event.
 *
 * Replaces the privilege matrix 0008 built: eight booleans, per-event custom
 * roles and an editor for them, none of which was ever used — every membership
 * on production held the one "Full" preset. An organizer now picks between
 * doing the work and only watching it, and the only thing they need in order
 * to invite someone is their email address.
 *
 * add_event_organizer takes that email whether or not it belongs to an account
 * yet: an unknown address is parked in pending_event_invites and applied the
 * first time it signs in, so inviting somebody does not require them to have
 * registered first. It returns 'granted' or 'invited' to say which happened.
 */
export function TeamManager({
  eventId,
  initialMembers,
  initialInvites,
  roleNames,
  creatorId,
  canManage,
}) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('co_organizer')
  const [state, setState] = useState('idle') // idle | working | error
  const [notice, setNotice] = useState(null)

  async function invite(e) {
    e.preventDefault()
    setState('working')
    setNotice(null)
    const { data, error } = await supabase.rpc('add_event_organizer', {
      p_event_id: eventId,
      p_email: email,
      p_preset_key: role,
    })
    if (error) {
      setState('error')
      return
    }
    setEmail('')
    setState('idle')
    // 'invited' means the address has no account yet and the grant is waiting.
    setNotice(data === 'invited' ? 'invited' : 'granted')
    router.refresh()
  }

  async function changeRole(userId, nextRole) {
    await supabase.rpc('add_event_organizer', {
      p_event_id: eventId,
      p_email: memberEmail(userId),
      p_preset_key: nextRole,
    })
    router.refresh()
  }

  function memberEmail(userId) {
    return initialMembers.find((m) => m.user_id === userId)?.email ?? ''
  }

  async function remove(userId) {
    await supabase.from('event_organizers').delete().eq('event_id', eventId).eq('user_id', userId)
    router.refresh()
  }

  async function cancelInvite(inviteEmail) {
    await supabase
      .from('pending_event_invites')
      .delete()
      .eq('event_id', eventId)
      .eq('email', inviteEmail)
    router.refresh()
  }

  return (
    <div className={styles.wrap}>
      <h1 className="page-title">{t('team')}</h1>
      <p className="field-help">{t('teamIntro')}</p>

      {canManage && (
        <form onSubmit={invite} className={styles.addRow}>
          <Field label={t('inviteEmail')}>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.org"
              />
            )}
          </Field>
          <Field label={t('adminRole')}>
            {({ id }) => (
              <NativeSelect id={id} value={role} onChange={(e) => setRole(e.target.value)}>
                {INVITABLE.map((key) => (
                  <option key={key} value={key}>
                    {roleNames[key] ?? key}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Button type="submit" disabled={state === 'working'}>
            {state === 'working' ? t('inviting') : t('invite')}
          </Button>
        </form>
      )}

      {state === 'error' && <p className="alert alert-error">{t('inviteError')}</p>}
      {notice === 'invited' && <p className="alert alert-info">{t('inviteQueued')}</p>}
      {notice === 'granted' && <p className="alert alert-info">{t('inviteGranted')}</p>}

      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th>{t('adminParticipant')}</th>
              <th>{t('adminRole')}</th>
              {canManage && <th>{tCommon('actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {initialMembers.map((m) => {
              const isOwner = m.user_id === creatorId
              return (
                <tr key={m.user_id}>
                  <td data-cell="title">
                    <div>{m.full_name || '—'}</div>
                    <div style={{ color: 'var(--ink-soft)' }}>{m.email}</div>
                  </td>
                  <td data-label={t('adminRole')}>
                    {/* The owner's role is the one thing on this page that
                        cannot change: it follows the event's creator. */}
                    {isOwner || !canManage ? (
                      <Badge>{roleNames[m.preset_key] ?? m.preset_key}</Badge>
                    ) : (
                      <NativeSelect
                        value={m.preset_key}
                        aria-label={t('adminRole')}
                        onChange={(e) => changeRole(m.user_id, e.target.value)}
                        style={{ width: 'auto' }}
                      >
                        {INVITABLE.map((key) => (
                          <option key={key} value={key}>
                            {roleNames[key] ?? key}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </td>
                  {canManage && (
                    <td data-cell="actions">
                      {!isOwner && (
                        <Button variant="ghost" size="sm" onClick={() => remove(m.user_id)}>
                          {t('remove')}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}

            {/* Invitations to addresses with no account yet. They become real
                memberships on first sign-in, so they are shown here rather than
                silently held. */}
            {initialInvites.map((inv) => (
              <tr key={inv.email}>
                <td data-cell="title">
                  <div style={{ color: 'var(--ink-soft)' }}>{inv.email}</div>
                </td>
                <td data-label={t('adminRole')}>
                  <Badge tone="pending">
                    {roleNames[inv.preset_key] ?? inv.preset_key} · {t('invitePending')}
                  </Badge>
                </td>
                {canManage && (
                  <td data-cell="actions">
                    <Button variant="ghost" size="sm" onClick={() => cancelInvite(inv.email)}>
                      {t('remove')}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
