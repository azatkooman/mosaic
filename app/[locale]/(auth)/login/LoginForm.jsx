'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button, Field, Input, MosaicMark } from '@/components/ui'
import styles from './login.module.css'

export function LoginForm({ oktaDomain }) {
  const t = useTranslations('auth')
  const tHome = useTranslations('home')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const supabase = getSupabaseBrowserClient()

  const next = searchParams.get('next') || `/${locale}`
  // Computed lazily — window does not exist during server prerender.
  const getRedirectTo = () =>
    `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`

  async function oauth(provider) {
    setState('idle')
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getRedirectTo() },
    })
    if (error) setState('error')
  }

  async function okta() {
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: oktaDomain,
      options: { redirectTo: getRedirectTo() },
    })
    if (error) setState('error')
    else if (data?.url) window.location.href = data.url
  }

  async function magicLink(e) {
    e.preventDefault()
    setState('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getRedirectTo() },
    })
    setState(error ? 'error' : 'sent')
  }

  return (
    <div className={styles.wrap}>
      <aside className={styles.brandPanel}>
        <div className={styles.brandTiles} aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className={styles.brandContent}>
          <div className={styles.brandMark} aria-hidden="true">
            <MosaicMark />
          </div>
          <h2 className={styles.brandHeadline}>{tHome('heroTitle')}</h2>
          <p className={styles.brandSub}>{tHome('heroSubtitle')}</p>
        </div>
      </aside>
      <div className={styles.formPanel}>
      <div className={`card card-pad ${styles.card}`}>
        <div className={styles.brand}>
          <MosaicMark />
        </div>
        <h1 className="page-title">{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <div className={styles.providers}>
          <Button variant="secondary" onClick={() => oauth('google')}>
            {t('continueWithGoogle')}
          </Button>
          <Button variant="secondary" onClick={() => oauth('apple')}>
            {t('continueWithApple')}
          </Button>
          {oktaDomain && (
            <Button variant="secondary" onClick={okta}>
              {t('continueWithOkta')}
            </Button>
          )}
        </div>

        <div className={styles.divider} role="separator">
          <span>{t('or')}</span>
        </div>

        {state === 'sent' ? (
          <p className="alert alert-success">{t('magicLinkSent')}</p>
        ) : (
          <form onSubmit={magicLink} className={styles.magic}>
            <Field label={t('emailLabel')} required>
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" disabled={state === 'sending'}>
              {t('sendMagicLink')}
            </Button>
          </form>
        )}

        {state === 'error' && <p className="alert alert-error">{t('authError')}</p>}
      </div>
      </div>
    </div>
  )
}
