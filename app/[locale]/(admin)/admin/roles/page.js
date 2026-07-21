import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RoleMatrix } from '@/components/roles/RoleMatrix'
import styles from '../admin-shell.module.css'

export const dynamic = 'force-dynamic'

export default async function AdminRolesPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('console')

  const supabase = await getSupabaseServerClient()
  const [{ data: org }, { data: eventRoles }] = await Promise.all([
    supabase.from('organizations').select('id').order('created_at').limit(1).maybeSingle(),
    // presets + global custom roles (event_id null)
    supabase.from('event_roles').select('*').is('event_id', null),
  ])

  return (
    <div className={styles.page}>
      <div>
        <h1 className="page-title">{t('roles')}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
          {t('rolesHelp')}
        </p>
      </div>
      <RoleMatrix roles={eventRoles ?? []} orgId={org?.id ?? null} eventId={null} />
    </div>
  )
}
