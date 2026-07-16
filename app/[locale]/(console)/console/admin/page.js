import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { AdminConsole } from './AdminConsole'

export const dynamic = 'force-dynamic'

export default async function AdminPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // The console layout redirects to login; render nothing meanwhile.
    return null
  }

  // UX gate only — RLS restricts every read/write below to admins anyway.
  const { data: myRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
  const isAdmin = (myRoles ?? []).some(
    (r) => r.role === 'admin' || r.role === 'super_admin'
  )
  if (!isAdmin) {
    return <p className="alert alert-info">{t('console.noAccess')}</p>
  }
  const isSuperAdmin = (myRoles ?? []).some((r) => r.role === 'super_admin')

  const [{ data: profiles }, { data: roles }, { data: requests }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('user_roles').select('user_id, role'),
    supabase
      .from('event_organizers')
      .select(
        'event_id, user_id, created_at, profiles:user_id ( full_name, email ), events:event_id ( name, default_locale )'
      )
      .eq('role', 'requested')
      .order('created_at', { ascending: true }),
  ])

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]))
  const users = (profiles ?? []).map((p) => ({
    ...p,
    role: roleByUser.get(p.id) ?? null,
  }))

  return (
    <AdminConsole
      users={users}
      requests={requests ?? []}
      currentUserId={user.id}
      isSuperAdmin={isSuperAdmin}
    />
  )
}
