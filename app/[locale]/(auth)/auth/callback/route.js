import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { AUTH_NEXT_COOKIE, safeNextPath } from '@/lib/url'

// Cookie parsers disagree about whether they decode values, so accept both: an
// already-decoded destination always starts with "/".
function decodeNext(raw) {
  if (typeof raw !== 'string') return null
  if (raw.startsWith('/')) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

// Exchanges the OAuth / magic-link code for a session cookie, then returns the
// user to whatever they were trying to reach before being asked to sign in.
export async function GET(request, { params }) {
  const { searchParams, origin } = new URL(request.url)
  const { locale } = await params
  const code = searchParams.get('code')

  // Set by the login form rather than passed through the provider — see
  // AUTH_NEXT_COOKIE for why the destination cannot ride in the query string.
  const cookieStore = await cookies()
  const next = safeNextPath(decodeNext(cookieStore.get(AUTH_NEXT_COOKIE)?.value), `/${locale}`)

  const done = (url) => {
    const res = NextResponse.redirect(url)
    res.cookies.delete({ name: AUTH_NEXT_COOKIE, path: '/' })
    return res
  }

  if (code) {
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return done(`${origin}${next}`)
  }

  // Carry the destination onto the retry so a second attempt still lands on it.
  // A magic link opened in a different browser is the common cause: the PKCE
  // verifier lives in the browser that requested the link.
  return done(`${origin}/${locale}/login?error=auth&next=${encodeURIComponent(next)}`)
}
