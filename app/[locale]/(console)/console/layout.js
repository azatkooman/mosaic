import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/lib/i18n/navigation'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MosaicMark } from '@/components/ui'
import { LocaleSwitcher } from '@/components/shell/LocaleSwitcher'
import { SignOutButton } from '@/components/shell/SignOutButton'
import { NavLink } from '@/components/shell/NavLink'
import { ProfileLink } from '@/components/shell/ProfileLink'
import { ThemeToggle } from '@/components/shell/ThemeToggle'
import { MobileNav } from '@/components/shell/MobileNav'
import { NamePrompt } from '@/components/shell/NamePrompt'
import { UnsavedWarningProvider } from '@/components/providers/UnsavedWarningProvider'
import { QueryProvider } from './QueryProvider'
import styles from './console.module.css'

export const dynamic = 'force-dynamic'

export default async function ConsoleLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect({ href: `/login?next=${encodeURIComponent(`/${locale}/console`)}`, locale })
  }

  // Everyone signed in can use the console (anyone can create events);
  // the Admin tab is a UX gate only — RLS is the real enforcement.
  // The unsaved-work preference is read here, once, for the three editors
  // below it (see UnsavedWarningProvider).
  const [{ data: globalRoles }, { data: profile }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('profiles').select('warn_unsaved_changes').eq('id', user.id).maybeSingle(),
  ])
  const isAdmin = (globalRoles ?? []).some(
    (r) => r.role === 'admin' || r.role === 'super_admin'
  )

  return (
    <QueryProvider>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/console" className={styles.brand}>
            <MosaicMark />
            <span>{t('console.title')}</span>
          </Link>
          <nav className={styles.topnav} aria-label="Console">
            <Link href="/">{t('console.navHome')} ↗</Link>
            <NavLink href="/console">{t('console.navMyEvents')}</NavLink>
            {isAdmin && <Link href="/admin">{t('console.admin')} ↗</Link>}
          </nav>
          <div className={styles.actions}>
            <ThemeToggle label={t('common.toggleTheme')} />
            {/* Desktop-only cluster; folded into the menu on phones. */}
            <div className={styles.desktopActions}>
              <LocaleSwitcher label={t('common.language')} />
              <ProfileLink className="btn btn-ghost btn-sm">{t('nav.profile')}</ProfileLink>
              <SignOutButton label={t('common.signOut')} />
            </div>
            <MobileNav label={t('common.menu')}>
              <Link href="/">{t('console.navHome')} ↗</Link>
              <NavLink href="/console">{t('console.navMyEvents')}</NavLink>
              {isAdmin && <Link href="/admin">{t('console.admin')} ↗</Link>}
              <ProfileLink>{t('nav.profile')}</ProfileLink>
              <LocaleSwitcher label={t('common.language')} />
              <SignOutButton label={t('common.signOut')} />
            </MobileNav>
          </div>
        </header>
        <main className={styles.main}>
          <UnsavedWarningProvider value={profile?.warn_unsaved_changes}>
            {children}
          </UnsavedWarningProvider>
        </main>
        <NamePrompt />
      </div>
    </QueryProvider>
  )
}
