'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge, Button, Field, Input } from '@/components/ui'

/**
 * Ask to become a global organizer (Full access to every event). Admins
 * approve or deny from the admin console.
 */
export function RequestOrganizerRole({ userId, roleRequested }) {
  const t = useTranslations('console')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(promise) {
    setError(null)
    setBusy(true)
    const { error } = await promise
    setBusy(false)
    if (error) setError(error.message)
    else router.refresh()
  }

  function request(e) {
    e.preventDefault()
    run(supabase.rpc('request_global_access', { p_message: message }))
  }

  function cancel() {
    run(supabase.from('role_requests').delete().eq('user_id', userId))
  }

  return (
    <section aria-label={t('requestRoleTitle')} style={{ marginBlockStart: 'var(--s-8)' }}>
      <h2>{t('requestRoleTitle')}</h2>
      <p style={{ color: 'var(--ink-soft)', marginBlock: 'var(--s-3)' }}>
        {t('requestRoleIntro')}
      </p>
      {error && <p className="alert alert-error">{error}</p>}
      {roleRequested ? (
        <p>
          <Badge tone="draft">{t('roleRequestPending')}</Badge>{' '}
          <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
            {t('cancelRequest')}
          </Button>
        </p>
      ) : (
        <form onSubmit={request} style={{ maxInlineSize: '28rem' }}>
          <Field label={t('requestRoleMessage')}>
            {({ id }) => (
              <Input
                id={id}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={busy} style={{ marginBlockStart: 'var(--s-3)' }}>
            {t('requestRole')}
          </Button>
        </form>
      )}
    </section>
  )
}
