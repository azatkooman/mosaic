import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RequestsAdmin } from './RequestsAdmin'

export const dynamic = 'force-dynamic'

export default async function AdminRequestsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const [{ data: profiles }, { data: requests }, { data: eventRoles }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name, email'),
      supabase
        .from('event_organizers')
        .select('event_id, user_id, created_at, events:event_id ( name, default_locale )')
        .eq('status', 'requested')
        .order('created_at', { ascending: true }),
      // presets + global custom roles for the approval dropdown
      supabase.from('event_roles').select('*').is('event_id', null),
    ])

  // No FK between event_organizers.user_id and profiles (both reference
  // auth.users), so PostgREST can't embed profiles — join in app code.
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const withProfile = (row) => ({ ...row, profiles: profileById.get(row.user_id) ?? null })

  return (
    <RequestsAdmin
      requests={(requests ?? []).map(withProfile)}
      eventRoles={eventRoles ?? []}
    />
  )
}
