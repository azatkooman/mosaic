'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Dialog } from '@/components/ui'

/**
 * Archive action for an event row — admins and the event's creator; the
 * archive_event RPC (migration 0048) re-checks server-side.
 *
 * Replaces the old DeleteEventButton, which called delete_event and destroyed
 * never-published drafts outright while archiving everything else. Archiving
 * is now the only outcome whatever the event's history, so the dialog can
 * promise one thing instead of branching on `everPublished`. Erasing an event
 * remains admin-only, from Admin ▸ Archived Events (purge_event, 0036).
 */
export function ArchiveEventButton({ eventId, eventName }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle') // idle | working | error

  async function archive() {
    setState('working')
    const { error } = await supabase.rpc('archive_event', { p_event_id: eventId })
    if (error) {
      setState('error')
      return
    }
    setOpen(false)
    setState('idle')
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setState('idle')
      }}
      title={t('archiveEventTitle', { name: eventName })}
      trigger={
        <button className="btn btn-ghost btn-sm" aria-label={`${t('archiveEvent')}: ${eventName}`}>
          {t('archiveEvent')}
        </button>
      }
    >
      <p style={{ color: 'var(--ink-soft)', marginBlock: 'var(--s-3) var(--s-4)' }}>
        {t('archiveEventWarning')}
      </p>
      {state === 'error' && <p className="alert alert-error">{t('archiveEventError')}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
        <Dialog.Close asChild>
          <Button variant="ghost" type="button">
            {tCommon('cancel')}
          </Button>
        </Dialog.Close>
        <Button variant="danger" onClick={archive} disabled={state === 'working'}>
          {state === 'working' ? t('archiving') : t('archiveEvent')}
        </Button>
      </div>
    </Dialog>
  )
}
