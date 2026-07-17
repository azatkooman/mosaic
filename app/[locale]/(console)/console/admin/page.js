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

  const [
    { data: org },
    { data: profiles },
    { data: roles },
    { data: requests },
    { data: roleRequests },
    { data: eventRoles },
  ] = await Promise.all([
    supabase.from('organizations').select('id').order('created_at').limit(1).maybeSingle(),
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('user_roles').select('user_id, role'),
    supabase
      .from('event_organizers')
      .select('event_id, user_id, created_at, events:event_id ( name, default_locale )')
      .eq('status', 'requested')
      .order('created_at', { ascending: true }),
    supabase
      .from('role_requests')
      .select('user_id, message, created_at')
      .order('created_at', { ascending: true }),
    // presets + global custom roles for the matrix and approval dropdowns
    supabase.from('event_roles').select('*').is('event_id', null),
  ])

  // No FK between *.user_id and profiles (both reference auth.users), so
  // PostgREST can't embed profiles — join in application code instead.
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const withProfile = (row) => ({ ...row, profiles: profileById.get(row.user_id) ?? null })

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]))
  const users = (profiles ?? []).map((p) => ({
    ...p,
    role: roleByUser.get(p.id) ?? null,
  }))

  return (
    <AdminConsole
      users={users}
      requests={(requests ?? []).map(withProfile)}
      roleRequests={(roleRequests ?? []).map(withProfile)}
      eventRoles={eventRoles ?? []}
      orgId={org?.id ?? null}
      currentUserId={user.id}
      isSuperAdmin={isSuperAdmin}
    />
  )
}
