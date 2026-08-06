import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui'
import { PRIVILEGES } from '@/components/roles/roleUtils'

export const dynamic = 'force-dynamic'

/**
 * Read-only team: who has access to this event, under which role, and what
 * that role actually permits.
 *
 * The privilege columns are spelled out rather than just naming the role,
 * because a role is editable and organizer-defined — "Full" on one event is
 * not necessarily "Full" on another, and an admin reviewing an archived event
 * needs what the grant meant, not what it was called.
 */
export default async function AdminEventTeam({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const [{ data: members }, { data: roles }] = await Promise.all([
    supabase
      .from('event_organizers')
      .select('user_id, role_id, status, created_at')
      .eq('event_id', eventId),
    supabase.from('event_roles').select('*').or(`event_id.is.null,event_id.eq.${eventId}`),
  ])

  // event_organizers.user_id and profiles.id both reference auth.users, so
  // there is no FK for PostgREST to embed across — join in two steps.
  let profileById = new Map()
  if (members?.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in(
        'id',
        members.map((m) => m.user_id)
      )
    profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  }
  const roleById = new Map((roles ?? []).map((r) => [r.id, r]))

  if (!members?.length) {
    return <p className="alert alert-info">{t('console.adminNothingHere')}</p>
  }

  return (
    <div className="table-wrap table-cards">
      <table className="table">
        <thead>
          <tr>
            <th>{t('console.adminMember')}</th>
            <th>{t('console.adminRole')}</th>
            <th>{t('console.status')}</th>
            <th>{t('console.adminPrivileges')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const profile = profileById.get(m.user_id)
            const role = roleById.get(m.role_id)
            const granted = role
              ? PRIVILEGES.filter((p) => role[p.key]).map((p) => t(`console.${p.label}`))
              : []
            return (
              <tr key={m.user_id}>
                <td data-cell="title">
                  <div>{profile?.full_name || '—'}</div>
                  <div style={{ color: 'var(--ink-soft)' }}>{profile?.email || m.user_id}</div>
                </td>
                <td data-label={t('console.adminRole')}>{role?.name ?? '—'}</td>
                <td data-label={t('console.status')}>
                  <Badge tone={m.status === 'active' ? 'confirmed' : 'pending'}>{m.status}</Badge>
                </td>
                <td data-label={t('console.adminPrivileges')}>
                  {granted.length ? granted.join(', ') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
