import { createClient } from '@supabase/supabase-js'

let _adminClient = null

/**
 * Returns a cached Supabase client initialized with the service role key.
 * Used strictly for server-side trusted administrative calls where RLS bypass
 * is required and explicit privilege checks have been performed.
 */
export function getSupabaseAdminClient() {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    _adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _adminClient
}
