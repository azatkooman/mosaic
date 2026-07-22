import { setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { TeamManager } from './TeamManager'

export const dynamic = 'force-dynamic'

export default async function TeamPage({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)

  const supabase = await getSupabaseServerClient()
  const [{ data: members }, { data: roles }, { data: event }] = await Promise.all([
    supabase
      .from('event_organizers')
      .select('user_id, role_id, status')
      .eq('event_id', eventId),
    // presets + global custom roles + this event's custom roles
    supabase
      .from('event_roles')
      .select('*')
      .or(`event_id.is.null,event_id.eq.${eventId}`),
    supabase.from('events').select('org_id, slug').eq('id', eventId).maybeSingle(),
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

  const withProfiles = (members ?? []).map((m) => ({
    ...m,
    profiles: profileById.get(m.user_id) ?? null,
  }))

  return (
    <TeamManager
      eventId={eventId}
      eventSlug={event?.slug ?? null}
      orgId={event?.org_id ?? null}
      initialMembers={withProfiles}
      roles={roles ?? []}
    />
  )
}
