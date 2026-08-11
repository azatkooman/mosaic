'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { lt } from '@/lib/i18n/locales'
import { uniqueSlug } from '@/lib/slug'
import { Button, Dialog, Field, Input } from '@/components/ui'

/**
 * Duplicate an event: forms, their published questions and participant types,
 * but none of the registrations. The clone lands as a draft so the organizer
 * can fix the dates (copied verbatim) before publishing.
 */
export function CloneEventButton({ event, trigger }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const sourceName = lt(event.name, locale, event.default_locale) || ''
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [state, setState] = useState('idle') // idle | working
  const [error, setError] = useState(null)

  function onOpenChange(next) {
    setOpen(next)
    if (next) {
      setError(null)
      setState('idle')
      setName(t('duplicateEventDefaultName', { name: sourceName }))
    }
  }

  async function clone(e) {
    e.preventDefault()
    setState('working')
    setError(null)
    const trimmed = name.trim() || sourceName
    const { data, error: rpcError } = await supabase.rpc('clone_event', {
      p_source_event_id: event.id,
      p_slug: uniqueSlug(trimmed),
      // Name is stored as a locale map; seed the event's own default language
      // so the copy reads correctly wherever the original did.
      p_name: { ...(event.name ?? {}), [event.default_locale ?? 'en']: trimmed },
    })
    if (rpcError || !data) {
      setError(
        /slug already taken/.test(rpcError?.message ?? '')
          ? t('duplicateEventSlugTaken')
          : t('duplicateError')
      )
      setState('idle')
      return
    }
    router.push(`/console/events/${data}/settings`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('duplicateEventTitle')}
      trigger={trigger}
    >
      <form onSubmit={clone} style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{t('duplicateEventHelp')}</p>
        <Field label={t('eventName')} required>
          {({ id }) => (
            <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        {error && <p className="alert alert-error">{error}</p>}
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {tCommon('cancel')}
            </Button>
          </Dialog.Close>
          <Button type="submit" disabled={state === 'working'}>
            {state === 'working' ? t('duplicating') : t('duplicateEvent')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
