'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales'
import { THEMES, applyThemeClient } from '@/lib/theme'
import { DATE_FORMATS, TIME_FORMATS, applyDateFormatClient } from '@/lib/date-format'
import { formatEventDate, formatSampleDate, formatSampleTime } from '@/lib/dates'
import { Button, Field, Input, NativeSelect } from '@/components/ui'

export function ProfileForm({ userId, initialProfile }) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const uiLocale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = getSupabaseBrowserClient()

  const [fullName, setFullName] = useState(initialProfile.full_name)
  const [preferredLocale, setPreferredLocale] = useState(initialProfile.preferred_locale)
  const [theme, setTheme] = useState(initialProfile.theme ?? 'system')
  const [dateFormat, setDateFormat] = useState(initialProfile.date_format ?? 'auto')
  const [timeFormat, setTimeFormat] = useState(initialProfile.time_format ?? 'auto')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // The profile row is the source of truth; reconcile the cookies to it on
  // load so a choice made on another device applies here too.
  useEffect(() => {
    applyThemeClient(initialProfile.theme ?? 'system')
    applyDateFormatClient({
      dateFormat: initialProfile.date_format ?? 'auto',
      timeFormat: initialProfile.time_format ?? 'auto',
    })
  }, [initialProfile.theme, initialProfile.date_format, initialProfile.time_format])

  // Preview the theme live as the user picks it, before saving.
  function pickTheme(next) {
    setTheme(next)
    applyThemeClient(next)
  }

  async function save(e) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        preferred_locale: preferredLocale,
        theme,
        date_format: dateFormat,
        time_format: timeFormat,
      })
      .eq('id', userId)
    setSaving(false)
    if (error) {
      setError(t('updateError'))
      return
    }
    applyThemeClient(theme)
    applyDateFormatClient({ dateFormat, timeFormat })
    setSaved(true)
    if (preferredLocale !== uiLocale) {
      // Switch the UI to the newly preferred language.
      router.replace(pathname, { locale: preferredLocale })
    } else {
      router.refresh()
    }
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 'var(--s-4)', maxInlineSize: '28rem' }}>
      <Field label={t('email')} help={t('emailHelp')}>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={initialProfile.email} disabled />
        )}
      </Field>
      <Field label={t('fullName')}>
        {({ id }) => (
          <Input
            id={id}
            value={fullName}
            maxLength={120}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
      </Field>
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
      <Field label={t('theme')} help={t('themeHelp')}>
        {({ id, describedBy }) => (
          <NativeSelect
            id={id}
            aria-describedby={describedBy}
            value={theme}
            onChange={(e) => pickTheme(e.target.value)}
          >
            {THEMES.map((value) => (
              <option key={value} value={value}>
                {t(`theme_${value}`)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field label={t('dateFormat')} help={t('dateFormatHelp')}>
        {({ id, describedBy }) => (
          <NativeSelect
            id={id}
            aria-describedby={describedBy}
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
          >
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
      <Field label={t('timeFormat')} help={t('timeFormatHelp')}>
        {({ id, describedBy }) => (
          <NativeSelect
            id={id}
            aria-describedby={describedBy}
            value={timeFormat}
            onChange={(e) => setTimeFormat(e.target.value)}
          >
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
      <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', margin: 0 }} aria-live="polite">
        {formatEventDate('2026-12-31T14:30:00Z', 'UTC', uiLocale, { dateFormat, timeFormat })}
      </p>
      {error && <p className="alert alert-error">{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <Button type="submit" disabled={saving}>
          {saving ? tCommon('loading') : tCommon('save')}
        </Button>
        {saved && <span style={{ color: 'var(--ink-soft)' }}>{t('saved')}</span>}
      </div>
    </form>
  )
}
