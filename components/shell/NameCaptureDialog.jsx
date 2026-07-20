'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Dialog, Field, Input } from '@/components/ui'

// Remembers a dismissal so the prompt doesn't re-nag on every navigation or
// reload; the server still stops rendering it entirely once a name is saved.
const DISMISSED_KEY = 'mosaic.namePrompt.dismissed'

// Flows that collect a name themselves or would be obscured by the modal.
function isExcludedPath(pathname) {
  return pathname.startsWith('/my/profile') || pathname.startsWith('/events/')
}

/** First-run prompt for users whose profile has no name yet.
 *  Saves "First Last" into profiles.full_name; dismissable. */
export function NameCaptureDialog({ userId }) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const supabase = getSupabaseBrowserClient()

  // Start closed so server and client markup match; open after mount only if
  // this browser hasn't dismissed it and we're not on an excluded route.
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isExcludedPath(pathname)) return
    if (localStorage.getItem(DISMISSED_KEY)) return
    setOpen(true)
  }, [pathname])

  function onOpenChange(next) {
    setOpen(next)
    // Any close that isn't a successful save counts as "skip for now".
    if (!next) localStorage.setItem(DISMISSED_KEY, '1')
  }

  async function save(e) {
    e.preventDefault()
    const first = firstName.trim()
    const last = lastName.trim()
    if (!first || !last) {
      setError(t('namePromptRequired'))
      return
    }
    setError(null)
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: `${first} ${last}` })
      .eq('id', userId)
      .select('id')
    setSaving(false)
    if (error || !data?.length) {
      setError(t('updateError'))
      return
    }
    localStorage.setItem(DISMISSED_KEY, '1')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('namePromptTitle')}>
      <form onSubmit={save} style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <p style={{ color: 'var(--ink-soft)', margin: 0 }}>{t('namePromptIntro')}</p>
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
        {error && <p className="alert alert-error">{error}</p>}
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
          <Dialog.Close asChild>
            <Button variant="ghost" type="button">
              {t('namePromptSkip')}
            </Button>
          </Dialog.Close>
          <Button type="submit" disabled={saving}>
            {saving ? tCommon('loading') : tCommon('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
