import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MosaicMark } from '@/components/ui'
import { LocaleSwitcher } from './LocaleSwitcher'
import { SignOutButton } from './SignOutButton'
import { NavLink } from './NavLink'
import { ThemeToggle } from './ThemeToggle'
import { MobileNav } from './MobileNav'
import styles from './shell.module.css'

export async function SiteHeader() {
  const t = await getTranslations()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin'])
    isAdmin = (roles?.length ?? 0) > 0
  }

  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" className={styles.brand}>
          <MosaicMark />
          <span>{t('common.appName')}</span>
        </Link>
        <nav className={styles.nav} aria-label={t('common.mainNav')}>
          <NavLink href="/">{t('nav.home')}</NavLink>
          {user && <NavLink href="/my/registrations">{t('nav.myRegistrations')}</NavLink>}
          {/* All signed-in users can open the console: those without access
              get the request-access panel instead of the event list. */}
          {user && <NavLink href="/console">{t('nav.console')}</NavLink>}
          {isAdmin && <NavLink href="/admin">{t('nav.adminConsole')}</NavLink>}
        </nav>
        <div className={styles.headerActions}>
          <ThemeToggle label={t('common.toggleTheme')} />
          {/* Desktop-only cluster; hidden on phones (moved into the menu). */}
          <div className={styles.desktopActions}>
            <LocaleSwitcher label={t('common.language')} />
            {user && (
              <Link href="/my/profile" className="btn btn-ghost btn-sm">
                {t('nav.profile')}
              </Link>
            )}
            {user ? (
              <SignOutButton label={t('common.signOut')} />
            ) : (
              <Link href="/login" className="btn btn-secondary btn-sm">
                {t('common.signIn')}
              </Link>
            )}
          </div>
          {/* Phone-only hamburger with the full navigation + actions. */}
          <MobileNav label={t('common.menu')}>
            <NavLink href="/">{t('nav.home')}</NavLink>
            {user && <NavLink href="/my/registrations">{t('nav.myRegistrations')}</NavLink>}
            {user && <NavLink href="/console">{t('nav.console')}</NavLink>}
            {isAdmin && <NavLink href="/admin">{t('nav.adminConsole')}</NavLink>}
            {user && (
              <Link href="/my/profile" className="btn btn-ghost btn-sm">
                {t('nav.profile')}
              </Link>
            )}
            <LocaleSwitcher label={t('common.language')} />
            {user ? (
              <SignOutButton label={t('common.signOut')} />
            ) : (
              <Link href="/login" className="btn btn-secondary btn-sm">
                {t('common.signIn')}
              </Link>
            )}
          </MobileNav>
        </div>
      </div>
    </header>
  )
}
