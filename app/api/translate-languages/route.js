import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTranslateLanguages } from '@/lib/i18n/translate-languages'

// Languages the organizer can add to an event, sourced live from Google
// Translate (cached). Auth-gated to match /api/translate-event.
export async function GET() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const languages = await getTranslateLanguages()
  return NextResponse.json({ languages })
}
