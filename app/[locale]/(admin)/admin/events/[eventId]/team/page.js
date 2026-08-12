import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Read-only team: who has access to this event and under which role.
 *
 * The privileges each grant conferred used to be spelled out column by column,
 * because a role was editable and organizer-defined — "Full" on one event was
 * not necessarily "Full" on another. Since 0053 there are three fixed roles
 * with fixed meanings, so the name is the whole story.
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
                  {role?.name ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
