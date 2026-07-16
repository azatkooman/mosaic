import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MosaicMark } from '@/components/ui'
import { LocaleSwitcher } from './LocaleSwitcher'
import { SignOutButton } from './SignOutButton'
import styles from './shell.module.css'

export async function SiteHeader() {
  const t = await getTranslations()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" className={styles.brand}>
          <MosaicMark />
          <span>{t('common.appName')}</span>
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/">{t('nav.events')}</Link>
          {user && <Link href="/my/registrations">{t('nav.myRegistrations')}</Link>}
          {/* All signed-in users can open the console: those without access
              get the request-access panel instead of the event list. */}
          {user && <Link href="/console">{t('nav.console')}</Link>}
        </nav>
        <div className={styles.headerActions}>
          <LocaleSwitcher label={t('common.language')} />
          {user ? (
            <SignOutButton label={t('common.signOut')} />
          ) : (
            <Link href="/login" className="btn btn-secondary btn-sm">
              {t('common.signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
