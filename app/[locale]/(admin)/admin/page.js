import { redirect } from '@/lib/i18n/navigation'

export default async function AdminIndex({ params }) {
  const { locale } = await params
  redirect({ href: '/admin/users', locale })
}
