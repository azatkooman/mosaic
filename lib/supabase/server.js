import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — proxy.js handles refresh.
          }
        },
      },
    }
  )
}

// Anonymous client for static rendering paths (ISR) where cookies() is
// unavailable. Only sees data allowed for the anon role (published events).
export function getSupabaseAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
