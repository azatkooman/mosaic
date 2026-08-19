'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Dialog, DropdownMenu } from '@/components/ui'

/**
 * The ⋯ menu on a mode-scoped form row, and the one thing in it.
 *
 * Only single and family forms get one. The default form is every participant
 * type's fallback, so archiving it would leave an event nobody can register
 * for — `archive_form` refuses it outright, and not offering the menu here is
 * the same rule said earlier rather than a second one.
 *
 * A menu for a single entry looks like overkill and is not: the entry is
 * destructive-ish, and putting it behind a deliberate second click is the point.
 * A bare "Archive" button beside "Edit form" would be one slip away.
 */
export function ArchiveFormButton({ formId, formTitle }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle') // idle | working
  const [error, setError] = useState(null)

  async function archive() {
    setState('working')
    setError(null)
    const { error: rpcError } = await supabase.rpc('archive_form', { p_form_id: formId })
    if (rpcError) {
      setError(rpcError.message || t('archiveFormError'))
      setState('idle')
      return
    }
    setOpen(false)
    setState('idle')
    // refresh, not push: the organizer stays on the list and watches the row
    // leave it, which is the confirmation. A redirect would only hide that.
    router.refresh()
  }

  return (
    <>
      <DropdownMenu
        align="end"
        trigger={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={t('formMoreOptions', { form: formTitle })}
          >
            <span aria-hidden="true">⋯</span>
          </button>
        }
      >
        <DropdownMenu.Item tone="danger" onSelect={() => setOpen(true)}>
          {t('archiveForm')}
        </DropdownMenu.Item>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(next) => !next && state !== 'working' && setOpen(false)}
        title={t('archiveFormTitle')}>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {t('archiveFormBody', { form: formTitle })}
        </p>
        {error && <p className="alert alert-error" style={{ marginTop: 'var(--s-3)' }}>{error}</p>}
        <div className="dialog-actions">
          <Dialog.Close asChild>
            <Button variant="ghost" type="button" disabled={state === 'working'}>
              {tCommon('cancel')}
            </Button>
          </Dialog.Close>
          <Button variant="danger" type="button" onClick={archive} disabled={state === 'working'}>
            {state === 'working' ? t('archiving') : t('archiveForm')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
