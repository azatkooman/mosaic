import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link, redirect } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MosaicMark } from '@/components/ui'
import { LocaleSwitcher } from '@/components/shell/LocaleSwitcher'
import { SignOutButton } from '@/components/shell/SignOutButton'
import styles from './admin-shell.module.css'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect({ href: `/login?next=${encodeURIComponent(`/${locale}/admin`)}`, locale })
  }

  // UX gate only — RLS restricts every admin read/write regardless.
  const { data: globalRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
  const isAdmin = (globalRoles ?? []).some(
    (r) => r.role === 'admin' || r.role === 'super_admin'
  )
  if (!isAdmin) {
    redirect({ href: '/console', locale })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/admin" className={styles.brand}>
          <MosaicMark />
          <span>{t('console.adminTitle')}</span>
        </Link>
        <nav className={styles.topnav} aria-label="Admin">
          <Link href="/admin/users">{t('console.adminUsers')}</Link>
          <Link href="/admin/roles">{t('console.roles')}</Link>
          <Link href="/admin/requests">{t('console.accessRequests')}</Link>
          <Link href="/console">{t('console.title')} ↗</Link>
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
    </div>
  )
}
