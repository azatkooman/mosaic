import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link, redirect } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/url'
import { ProfileForm } from './ProfileForm'

export const dynamic = 'force-dynamic'

export default async function ProfilePage({ params, searchParams }) {
  const { locale } = await params
  const { next } = (await searchParams) ?? {}
  setRequestLocale(locale)
  const t = await getTranslations()

  // Where the header's Profile link was clicked from (components/shell/
  // ProfileLink). Validated as a same-origin path — `next` is a query
  // parameter, so a crafted link could otherwise put "//evil.com" behind our
  // own Back button. No parameter means the user got here some other way and
  // there is nothing to go back to, so no button is rendered.
  const backHref = safeNextPath(next, null)

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect({ href: `/login?next=${encodeURIComponent(`/${locale}/my/profile`)}`, locale })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, preferred_locale, theme, date_format, time_format, warn_unsaved_changes'
    )
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
      {backHref && (
        <div style={{ marginBottom: 'var(--s-3)' }}>
          <Link href={backHref} className="btn btn-ghost btn-sm">
            <span aria-hidden="true">&larr;</span> {t('common.back')}
          </Link>
        </div>
      )}
      <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
        {t('profile.title')}
      </h1>
      <ProfileForm
        userId={user.id}
        initialProfile={{
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? user.email ?? '',
          preferred_locale: profile?.preferred_locale ?? locale,
          theme: profile?.theme ?? 'system',
          date_format: profile?.date_format ?? 'auto',
          time_format: profile?.time_format ?? 'auto',
          // Null (no row, or migration 0048 unapplied) means on: the warning
          // is the safe default and only an explicit false takes it away.
          warn_unsaved_changes: profile?.warn_unsaved_changes !== false,
        }}
      />
    </div>
  )
}
