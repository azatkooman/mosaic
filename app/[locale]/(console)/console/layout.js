import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/lib/i18n/navigation'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MosaicMark } from '@/components/ui'
import { LocaleSwitcher } from '@/components/shell/LocaleSwitcher'
import { SignOutButton } from '@/components/shell/SignOutButton'
import { NamePrompt } from '@/components/shell/NamePrompt'
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
  const { data: globalRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
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
            <Link href="/console">{t('console.navMyEvents')}</Link>
            {isAdmin && <Link href="/admin">{t('console.admin')} ↗</Link>}
          </nav>
          <div className={styles.actions}>
            <LocaleSwitcher label={t('common.language')} />
            <Link href="/my/profile" className="btn btn-ghost btn-sm">
              {t('nav.profile')}
            </Link>
            <SignOutButton label={t('common.signOut')} />
          </div>
        </header>
        <main className={styles.main}>{children}</main>
        <NamePrompt />
      </div>
    </QueryProvider>
  )
}
