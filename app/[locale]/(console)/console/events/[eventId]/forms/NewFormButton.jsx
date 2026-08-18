'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { defaultFormQuestions } from '@/lib/form-defaults'
import { Button, Dialog, Field, NativeSelect, RadioGroup, RadioRow } from '@/components/ui'
import styles from '../../../console.module.css'

// The mode value stays 'family' internally; the display title says "Group".
const MODE_TITLES = {
  single: 'Single response form',
  family: 'Group response form',
}

/** Creates a mode-scoped form (single/family response form). When other
 *  forms already exist, offers to copy their questions into the new draft. */
export function NewFormButton({ eventId, existingForms }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const takenModes = new Set(existingForms.map((f) => f.registration_mode).filter(Boolean))
  const availableModes = ['single', 'family'].filter((m) => !takenModes.has(m))

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(availableModes[0] ?? null)
  // Default to copying from an existing form — the point of the prompt is
  // to spare the organizer from rebuilding questions by hand.
  const [copyFromId, setCopyFromId] = useState(existingForms[0]?.id ?? '')
  const [state, setState] = useState('idle') // idle | creating
  const [error, setError] = useState(null)

  if (availableModes.length === 0) return null

  async function create(e) {
    e.preventDefault()
    if (!mode) return
    setState('creating')
    setError(null)

    // Appearance rides along with the questions — the control says "Copy from",
    // not "copy the questions from", and a copy that came back in default
    // styling would be a surprise every time. Read before the insert so the new
    // form is *created* looking right, rather than created plain and restyled a
    // moment later by a second write that can fail on its own.
    let appearance = null
    if (copyFromId) {
      const { data: sourceForm } = await supabase
        .from('forms')
        .select('appearance')
        .eq('id', copyFromId)
        .maybeSingle()
      appearance = sourceForm?.appearance ?? null
    }

    const { data: form, error: insertError } = await supabase
      .from('forms')
      .insert({
        event_id: eventId,
        title: MODE_TITLES[mode],
        registration_mode: mode,
        // Omitted when starting blank: `{}` is the column default and means
        // "inherit the event page theme", which is what a new form should do.
        ...(appearance ? { appearance } : {}),
      })
      .select('id')
      .single()
    if (insertError || !form) {
      setError(t('newFormError'))
      setState('idle')
      return
    }

    const { data: versionId, error: draftError } = await supabase.rpc(
      'create_draft_version',
      { p_form_id: form.id }
    )
    if (draftError || !versionId) {
      setError(t('newFormError'))
      setState('idle')
      return
    }

    // Pick up the version numbering where an archived form of the same mode
    // left off. A re-added form is a NEW row, so create_draft_version starts it
    // at 1 — which would tell an organizer their single form had gone back to
    // v1 when the versions it is continuing from are still in the table and
    // still answer for the registrations made on them. Same event, same mode:
    // continuing from some other form's count would be a number with no story.
    const { data: prior } = await supabase
      .from('form_versions')
      .select('version, forms!inner ( event_id, registration_mode, archived_at )')
      .eq('forms.event_id', eventId)
      .eq('forms.registration_mode', mode)
      .not('forms.archived_at', 'is', null)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (prior?.version) {
      // Best-effort: a form that starts at v1 is a cosmetic disappointment, not
      // a broken one, so a failure here must not strand the form just created.
      await supabase
        .from('form_versions')
        .update({ version: prior.version + 1 })
        .eq('id', versionId)
    }

    if (copyFromId) {
      // Copy the source form's latest definition (draft if one exists,
      // otherwise the published version) into the new draft.
      const { data: source } = await supabase
        .from('form_versions')
        .select('definition')
        .eq('form_id', copyFromId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (source?.definition) {
        await supabase
          .from('form_versions')
          .update({ definition: source.definition })
          .eq('id', versionId)
      }
    } else {
      // Blank forms start with the default name + email questions.
      await supabase
        .from('form_versions')
        .update({ definition: { questions: defaultFormQuestions() } })
        .eq('id', versionId)
    }

    router.push(`/console/events/${eventId}/forms/${form.id}`)
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
      title={t('newFormTitle')}
      trigger={<button className="btn btn-primary">{t('newForm')}</button>}
    >
      <form onSubmit={create} className={styles.newEventForm}>
        <Field label={t('formMode')}>
          {() => (
            <RadioGroup value={mode ?? ''} onValueChange={setMode} aria-label={t('formMode')}>
              {availableModes.map((m) => (
                <RadioRow
                  key={m}
                  id={`form-mode-${m}`}
                  value={m}
                  checked={mode === m}
                  label={
                    <span>
                      <strong>{m === 'single' ? t('formKindSingle') : t('formKindFamily')}</strong>
                      <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
                        {m === 'single' ? t('formModeSingleHelp') : t('formModeFamilyHelp')}
                      </span>
                    </span>
                  }
                />
              ))}
            </RadioGroup>
          )}
        </Field>

        {existingForms.length > 0 && (
          <Field label={t('copyFrom')} help={t('copyFromHelp')}>
            {({ id }) => (
              <NativeSelect id={id} value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
                <option value="">{t('startBlank')}</option>
                {existingForms.map((f) => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}

        {error && <p className="alert alert-error">{error}</p>}

        <div className={styles.newEventActions}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {tCommon('cancel')}
            </Button>
          </Dialog.Close>
          <Button type="submit" disabled={state === 'creating' || !mode}>
            {state === 'creating' ? t('creating') : t('createForm')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
