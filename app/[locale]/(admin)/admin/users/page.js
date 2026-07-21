import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { UsersAdmin } from './UsersAdmin'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // The admin layout redirects to login; render nothing meanwhile.
    return null
  }

  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('user_roles').select('user_id, role'),
  ])

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]))
  const users = (profiles ?? []).map((p) => ({
    ...p,
    role: roleByUser.get(p.id) ?? null,
  }))
  const isSuperAdmin = roleByUser.get(user.id) === 'super_admin'

  return (
    <UsersAdmin users={users} currentUserId={user.id} isSuperAdmin={isSuperAdmin} />
  )
}
