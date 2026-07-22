import { getSupabaseServerClient } from '@/lib/supabase/server'
import { NameCaptureDialog } from './NameCaptureDialog'

/** One-time welcome dialog for users who haven't been onboarded yet
 *  (onboarded_at is null): captures the name when missing and offers
 *  language + date/time format preferences. Skippable; shown once. */
export async function NamePrompt() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, onboarded_at, preferred_locale, date_format, time_format')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.onboarded_at) return null

  return (
    <NameCaptureDialog
      userId={user.id}
      needsName={!profile.full_name}
      initialLocale={profile.preferred_locale ?? 'en'}
      initialDateFormat={profile.date_format ?? 'auto'}
      initialTimeFormat={profile.time_format ?? 'auto'}
    />
  )
}
