import { getSupabaseServerClient } from '@/lib/supabase/server'
import { NameCaptureDialog } from './NameCaptureDialog'

/** Shows the name-capture dialog to signed-in users whose profile has no
 *  full_name (magic-link sign-ups; OAuth providers already supply one). */
export async function NamePrompt() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.full_name) return null

  return <NameCaptureDialog userId={user.id} />
}
