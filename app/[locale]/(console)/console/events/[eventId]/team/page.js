import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { TeamManager } from './TeamManager'

export const dynamic = 'force-dynamic'

export default async function TeamPage({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const [{ data: members }, { data: roles }, { data: event }, { data: invites }, { data: canManage }] =
    await Promise.all([
      supabase.from('event_organizers').select('user_id, role_id').eq('event_id', eventId),
      // Three fixed rows since 0053; no per-event roles to union in any more.
      supabase.from('event_roles').select('id, preset_key, name'),
      supabase.from('events').select('created_by, slug').eq('id', eventId).maybeSingle(),
      supabase
        .from('pending_event_invites')
        .select('email, preset_key')
        .eq('event_id', eventId)
        .order('created_at'),
      // The RPC re-checks; this only decides whether to render the controls.
      supabase.rpc('can_manage_team_api', { eid: eventId }),
    ])

  // No FK between event_organizers.user_id and profiles (both reference
  // auth.users), so PostgREST can't embed — fetch and join in two steps.
  let profileById = new Map()
  if (members?.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', members.map((m) => m.user_id))
    profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  }

  const presetById = new Map((roles ?? []).map((r) => [r.id, r.preset_key]))
  const roleNames = Object.fromEntries((roles ?? []).map((r) => [r.preset_key, r.name]))

  // Owner first, then everyone else by name: the creator is the fixed point of
  // the list and the only row whose role cannot be changed.
  const rows = (members ?? [])
    .map((m) => ({
      user_id: m.user_id,
      preset_key: presetById.get(m.role_id) ?? 'co_organizer',
      full_name: profileById.get(m.user_id)?.full_name ?? null,
      email: profileById.get(m.user_id)?.email ?? '',
    }))
    .sort((a, b) => {
      if (a.user_id === event?.created_by) return -1
      if (b.user_id === event?.created_by) return 1
      return (a.full_name || a.email).localeCompare(b.full_name || b.email)
    })

  return (
    <TeamManager
      eventId={eventId}
      initialMembers={rows}
      initialInvites={invites ?? []}
      roleNames={roleNames}
      creatorId={event?.created_by ?? null}
      canManage={Boolean(canManage)}
    />
  )
}
