import { redirect } from '@/lib/i18n/navigation'

// The admin console moved to its own shell at /admin; keep old links working.
export default async function LegacyAdminRedirect({ params }) {
  const { locale } = await params
  redirect({ href: '/admin', locale })
}
