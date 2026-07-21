'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { defaultFormQuestions } from '@/lib/form-defaults'
import { Button, Dialog, Field, NativeSelect, RadioGroup, RadioRow } from '@/components/ui'
import styles from '../../../console.module.css'

const MODE_TITLES = {
  single: 'Single response form',
  family: 'Family response form',
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

    const { data: form, error: insertError } = await supabase
      .from('forms')
      .insert({ event_id: eventId, title: MODE_TITLES[mode], registration_mode: mode })
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
          <Field label={t('copyQuestionsFrom')} help={t('copyQuestionsHelp')}>
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
