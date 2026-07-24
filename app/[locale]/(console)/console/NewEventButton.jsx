'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { fromLocalInput } from '@/lib/dates'
import { DEFAULT_PARTICIPANT_TYPE } from '@/lib/participant-type-presets'
import { defaultFormQuestions } from '@/lib/form-defaults'
import { Button, Dialog, Field, Input, NativeSelect, PreferenceDateInput } from '@/components/ui'
import styles from './console.module.css'

function slugify(name) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Random suffix keeps slugs unique; non-latin names slugify to ''.
  return `${base || 'event'}-${Date.now().toString(36)}`
}

function defaultDates() {
  const start = new Date(Date.now() + 30 * 86400_000)
  start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 2 * 86400_000)
  const toInput = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`
  return { start: toInput(start), end: toInput(end) }
}

/** Opens a dialog collecting the essentials, then creates a draft event
 *  (+ default registration form and participant type) and jumps to settings. */
export function NewEventButton({ label }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const initial = defaultDates()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState(initial.start)
  const [endsAt, setEndsAt] = useState(initial.end)
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  )
  const [state, setState] = useState('idle') // idle | creating
  const [error, setError] = useState(null)

  const timezones = Intl.supportedValuesOf?.('timeZone') ?? ['UTC']

  async function create(e) {
    e.preventDefault()
    setState('creating')
    setError(null)

    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      setError(t('createDateError'))
      setState('idle')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .order('created_at')
      .limit(1)
      .maybeSingle()

    if (orgError || !org || !user) {
      setError(t('createError'))
      setState('idle')
      return
    }

    const { data: event, error: insertError } = await supabase
      .from('events')
      .insert({
        org_id: org.id,
        slug: slugify(name),
        name: { en: name.trim() },
        timezone,
        starts_at: fromLocalInput(startsAt, timezone),
        ends_at: fromLocalInput(endsAt, timezone),
        created_by: user.id,
      })
      .select('id')
      .single()

    if (insertError || !event) {
      // 42501 = RLS rejection: the account lacks a global organizer/admin role.
      setError(insertError?.code === '42501' ? t('createNoAccess') : t('createError'))
      setState('idle')
      return
    }

    // Best-effort scaffolding: a default form and participant type so the
    // event is registerable out of the box. Settings can change both.
    const { data: form } = await supabase
      .from('forms')
      .insert({ event_id: event.id, title: 'Default form' })
      .select('id')
      .single()
    if (form) {
      const { data: versionId } = await supabase.rpc('create_draft_version', {
        p_form_id: form.id,
      })
      // New forms start with name + email questions (removable in the builder).
      // Publish this first version immediately so the event is registerable
      // out of the box — an event can't be published without a published form.
      if (versionId) {
        await supabase
          .from('form_versions')
          .update({ definition: { questions: defaultFormQuestions() } })
          .eq('id', versionId)
        // p_creator_published:false — this failsafe publish keeps a fallback
        // form available but must NOT satisfy the "creator published a form"
        // guard; the creator still has to publish a form themselves.
        await supabase.rpc('publish_form_version', {
          p_version_id: versionId,
          p_creator_published: false,
        })
      }
      await supabase.from('participant_types').insert({
        event_id: event.id,
        key: DEFAULT_PARTICIPANT_TYPE.key,
        name: DEFAULT_PARTICIPANT_TYPE.name,
        form_id: form.id,
        sort_order: 0,
      })
    }

    router.push(`/console/events/${event.id}/settings`)
  }

  function onOpenChange(next) {
    setOpen(next)
    if (next) {
      setError(null)
      setState('idle')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('newEventTitle')}
      trigger={<button className="btn btn-primary">{label}</button>}
    >
      <form onSubmit={create} className={styles.newEventForm}>
        <Field label={t('eventName')} required>
          {({ id }) => (
            <Input
              id={id}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className={styles.newEventDates}>
          <Field label={t('startsAt')} required>
            {({ id }) => (
              <PreferenceDateInput
                id={id}
                type="datetime-local"
                required
                value={startsAt}
                onChange={setStartsAt}
              />
            )}
          </Field>
          <Field label={t('endsAt')} required>
            {({ id }) => (
              <PreferenceDateInput
                id={id}
                type="datetime-local"
                required
                value={endsAt}
                onChange={setEndsAt}
              />
            )}
          </Field>
        </div>
        <Field label={t('timezone')}>
          {({ id }) => (
            <NativeSelect id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </NativeSelect>
          )}
        </Field>

        {error && <p className="alert alert-error">{error}</p>}

        <div className={styles.newEventActions}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {tCommon('cancel')}
            </Button>
          </Dialog.Close>
          <Button type="submit" disabled={state === 'creating'}>
            {state === 'creating' ? t('creating') : t('create')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
