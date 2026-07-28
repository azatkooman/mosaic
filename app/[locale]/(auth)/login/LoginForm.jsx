'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { AUTH_NEXT_COOKIE, safeNextPath } from '@/lib/url'
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

  const next = safeNextPath(searchParams.get('next'), `/${locale}`)
  // The callback route reports a failed code exchange this way; only surface it
  // until the next attempt starts, so it never sits beside "check your email".
  const exchangeFailed = searchParams.get('error') === 'auth' && state === 'idle'

  // Deliberately bare. Supabase matches redirectTo against the project's
  // Redirect URL allow-list query string and all, so a `?next=` here risks a
  // silent fallback to Site URL that strands the user on the wrong page. The
  // destination travels in a cookie instead. Computed lazily — window does not
  // exist during server prerender.
  const getRedirectTo = () => `${window.location.origin}/${locale}/auth/callback`

  function rememberNext() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie =
      `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=600; SameSite=Lax${secure}`
  }

  async function oauth(provider) {
    setState('idle')
    rememberNext()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getRedirectTo() },
    })
    if (error) setState('error')
  }

  async function okta() {
    rememberNext()
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
    rememberNext()
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
      <div className={styles.formTiles} aria-hidden="true">
        <span /><span /><span /><span />
      </div>
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

        {(state === 'error' || exchangeFailed) && (
          <p className="alert alert-error">{t('authError')}</p>
        )}
      </div>
      </div>
    </div>
  )
}
