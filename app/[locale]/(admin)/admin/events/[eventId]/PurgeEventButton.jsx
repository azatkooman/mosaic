'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Dialog } from '@/components/ui'

/**
 * Permanent deletion of a whole event, from the admin console only.
 *
 * The counterpart to DeleteEventButton, which archives. This one erases: the
 * event, its forms and versions, its participant types, and every registration
 * on it. purge_event (migration 0036) re-checks both the admin gate and the
 * eligibility rule — an event must be archived, or over — so `eligible` here
 * is the explanation rather than the enforcement.
 */
export function PurgeEventButton({ eventId, eventName, eligible, participantCount, labels }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle') // idle | working | error
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  async function purge() {
    setState('working')
    const { error } = await supabase.rpc('purge_event', { p_event_id: eventId })
    if (error) {
      setState('error')
      return
    }
    // The event no longer exists, so there is nothing to return to.
    router.push('/admin/events')
    router.refresh()
  }

  return (
    <section
      style={{
        marginBlockStart: 'var(--s-6)',
        padding: 'var(--s-4)',
        border: '1px solid var(--danger)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <h2 className="eyebrow" style={{ color: 'var(--danger)', marginBlockEnd: 'var(--s-2)' }}>
        {labels.dangerZone}
      </h2>
      <p style={{ color: 'var(--ink-soft)', marginBlockEnd: 'var(--s-3)' }}>
        {eligible ? labels.purgeEventHelp : labels.purgeEventBlocked}
      </p>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setState('idle')
        }}
        title={labels.purgeEventTitle.replace('{name}', eventName)}
        trigger={
          <button type="button" className="btn btn-danger btn-sm" disabled={!eligible}>
            {labels.purgeEvent}
          </button>
        }
      >
        <p className="alert alert-error" role="alert" style={{ marginBlock: 'var(--s-3)' }}>
          {labels.purgeEventWarning.replace('{count}', participantCount)}
        </p>
        {state === 'error' && (
          <p className="alert alert-error" role="alert">
            {labels.purgeEventError}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {labels.cancel}
            </Button>
          </Dialog.Close>
          <Button variant="danger" onClick={purge} disabled={state === 'working'}>
            {state === 'working' ? labels.deleting : labels.purgeEvent}
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
