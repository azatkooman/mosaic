'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Dialog } from '@/components/ui'

/**
 * Red delete action for an event row (admins + the event creator; the
 * delete_event RPC re-checks server-side). Never-published drafts are
 * removed permanently; once-published events are hidden but kept in the
 * database as archive history — the confirm dialog says which will happen.
 */
export function DeleteEventButton({ eventId, eventName, everPublished }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle') // idle | deleting | error

  async function destroy() {
    setState('deleting')
    const { error } = await supabase.rpc('delete_event', { p_event_id: eventId })
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
      title={t('deleteEventTitle', { name: eventName })}
      trigger={
        <button className="btn btn-danger btn-sm" aria-label={`${t('deleteEvent')}: ${eventName}`}>
          {t('deleteEvent')}
        </button>
      }
    >
      <p style={{ color: 'var(--ink-soft)', marginBlock: 'var(--s-3) var(--s-4)' }}>
        {everPublished ? t('deleteEventPublishedWarning') : t('deleteEventDraftWarning')}
      </p>
      {state === 'error' && <p className="alert alert-error">{t('deleteEventError')}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
        <Dialog.Close asChild>
          <Button variant="ghost" type="button">
            {tCommon('cancel')}
          </Button>
        </Dialog.Close>
        <Button variant="danger" onClick={destroy} disabled={state === 'deleting'}>
          {state === 'deleting' ? t('deleting') : t('deleteEvent')}
        </Button>
      </div>
    </Dialog>
  )
}
