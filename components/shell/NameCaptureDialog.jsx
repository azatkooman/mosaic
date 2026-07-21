'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales'
import { DATE_FORMATS, TIME_FORMATS, applyDateFormatClient } from '@/lib/date-format'
import { formatSampleDate, formatSampleTime } from '@/lib/dates'
import { Button, Dialog, Field, Input, NativeSelect } from '@/components/ui'

// Flows that collect these details themselves or would be obscured by the modal.
function isExcludedPath(pathname) {
  return pathname.startsWith('/my/profile') || pathname.startsWith('/events/')
}

/** One-time welcome: name (when missing) + language + date/time formats.
 *  Saving is the only way out — the server stops rendering the dialog once
 *  onboarded_at is set. */
export function NameCaptureDialog({
  userId,
  needsName = true,
  initialLocale,
  initialDateFormat = 'auto',
  initialTimeFormat = 'auto',
}) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const uiLocale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = getSupabaseBrowserClient()

  // Start closed so server and client markup match; open after mount only if
  // this browser hasn't dismissed it and we're not on an excluded route.
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [preferredLocale, setPreferredLocale] = useState(initialLocale ?? uiLocale)
  const [dateFormat, setDateFormat] = useState(initialDateFormat)
  const [timeFormat, setTimeFormat] = useState(initialTimeFormat)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isExcludedPath(pathname)) return
    setOpen(true)
  }, [pathname])

  function onOpenChange(next) {
    // Escape / overlay clicks must not dismiss: saving is the only way out.
    if (next) setOpen(true)
  }

  async function save(e) {
    e.preventDefault()
    const first = firstName.trim()
    const last = lastName.trim()
    if (needsName && (!first || !last)) {
      setError(t('namePromptRequired'))
      return
    }
    setError(null)
    setSaving(true)
    const patch = {
      preferred_locale: preferredLocale,
      date_format: dateFormat,
      time_format: timeFormat,
      onboarded_at: new Date().toISOString(),
    }
    if (needsName) patch.full_name = `${first} ${last}`
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id')
    setSaving(false)
    if (error || !data?.length) {
      setError(t('updateError'))
      return
    }
    applyDateFormatClient({ dateFormat, timeFormat })
    setOpen(false)
    if (preferredLocale !== uiLocale) {
      router.replace(pathname, { locale: preferredLocale })
    } else {
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('namePromptTitle')}>
      <form onSubmit={save} style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <p style={{ color: 'var(--ink-soft)', margin: 0 }}>{t('namePromptIntro')}</p>
        {needsName && (
          <>
            <Field label={t('firstName')} required>
              {({ id }) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={60}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('lastName')} required>
              {({ id }) => (
                <Input
                  id={id}
                  required
                  maxLength={60}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              )}
            </Field>
          </>
        )}
        <Field label={t('language')}>
          {({ id }) => (
            <NativeSelect
              id={id}
              value={preferredLocale}
              onChange={(e) => setPreferredLocale(e.target.value)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <p style={{ color: 'var(--ink-soft)', margin: 0, fontSize: 'var(--text-sm)' }}>
          {t('formatPromptIntro')}
        </p>
        <Field label={t('dateFormat')}>
          {({ id }) => (
            <NativeSelect id={id} value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
              {DATE_FORMATS.map((value) => (
                <option key={value} value={value}>
                  {value === 'auto'
                    ? `${t('dateFormat_auto')} — ${formatSampleDate('auto', uiLocale)}`
                    : formatSampleDate(value, uiLocale)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('timeFormat')}>
          {({ id }) => (
            <NativeSelect id={id} value={timeFormat} onChange={(e) => setTimeFormat(e.target.value)}>
              {TIME_FORMATS.map((value) => (
                <option key={value} value={value}>
                  {value === 'auto'
                    ? `${t('timeFormat_auto')} — ${formatSampleTime('auto', uiLocale)}`
                    : formatSampleTime(value, uiLocale)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        {error && <p className="alert alert-error">{error}</p>}
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
          <Button type="submit" disabled={saving}>
            {saving ? tCommon('loading') : tCommon('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
