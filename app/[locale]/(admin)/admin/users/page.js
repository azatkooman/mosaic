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

  // Only the people who actually hold a global role, not everyone who has ever
  // signed in. The full list was a directory an admin had to scroll to find one
  // person, it grew with every registrant, and it put every user's email in
  // front of every admin for no reason — granting a role has always been done
  // by typing an address, which invite_global_role takes whether or not that
  // address has an account yet.
  const { data: roles } = await supabase.from('user_roles').select('user_id, role')
  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]))

  let users = []
  if (roleByUser.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .in('id', [...roleByUser.keys()])
      .order('created_at', { ascending: true })
    users = (profiles ?? []).map((p) => ({ ...p, role: roleByUser.get(p.id) ?? null }))
  }
  const isSuperAdmin = roleByUser.get(user.id) === 'super_admin'

  return (
    <UsersAdmin users={users} currentUserId={user.id} isSuperAdmin={isSuperAdmin} />
  )
}
