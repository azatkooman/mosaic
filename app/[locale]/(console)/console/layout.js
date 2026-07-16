import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/lib/i18n/navigation'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MosaicMark } from '@/components/ui'
import { LocaleSwitcher } from '@/components/shell/LocaleSwitcher'
import { SignOutButton } from '@/components/shell/SignOutButton'
import { QueryProvider } from './QueryProvider'
import { RequestAccess } from './RequestAccess'
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

  // UX gate only — RLS is the real enforcement on every query.
  // A pending 'requested' row grants nothing.
  const [{ data: globalRoles }, { data: eventRoles }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('event_organizers')
      .select('event_id')
      .eq('user_id', user.id)
      .neq('role', 'requested')
      .limit(1),
  ])
  const isAdmin = (globalRoles ?? []).some(
    (r) => r.role === 'admin' || r.role === 'super_admin'
  )
  const hasAccess = (globalRoles?.length ?? 0) > 0 || (eventRoles?.length ?? 0) > 0

  if (!hasAccess) {
    const [{ data: events }, { data: requests }] = await Promise.all([
      supabase
        .from('events')
        .select('id, name, default_locale, starts_at, ends_at, timezone')
        .eq('status', 'published')
        .order('starts_at', { ascending: true }),
      supabase.from('event_organizers').select('event_id').eq('user_id', user.id),
    ])
    return (
      <div className="container" style={{ paddingBlock: 'var(--s-8)' }}>
        <RequestAccess
          events={events ?? []}
          requestedEventIds={(requests ?? []).map((r) => r.event_id)}
        />
      </div>
    )
  }

  return (
    <QueryProvider>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/console" className={styles.brand}>
            <MosaicMark />
            <span>{t('console.title')}</span>
          </Link>
          <nav className={styles.topnav} aria-label="Console">
            <Link href="/console">{t('console.events')}</Link>
            {isAdmin && <Link href="/console/admin">{t('console.admin')}</Link>}
            <Link href="/">{t('nav.events')} ↗</Link>
          </nav>
          <div className={styles.actions}>
            <LocaleSwitcher label={t('common.language')} />
            <SignOutButton label={t('common.signOut')} />
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </QueryProvider>
  )
}
