import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'

export const dynamic = 'force-dynamic'

export default async function ProfilePage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect({ href: `/login?next=${encodeURIComponent(`/${locale}/my/profile`)}`, locale })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, preferred_locale')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
      <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
        {t('profile.title')}
      </h1>
      <ProfileForm
        userId={user.id}
        initialProfile={{
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? user.email ?? '',
          preferred_locale: profile?.preferred_locale ?? locale,
        }}
      />
    </div>
  )
}
