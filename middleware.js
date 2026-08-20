import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { routing } from './lib/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

// Cap every auth request. supabase-js has no timeout of its own, so when the
// auth host is slow — or gone, as when its Supabase project is deleted — the
// await below never settles and the platform kills the whole middleware:
// MIDDLEWARE_INVOCATION_TIMEOUT, i.e. a 504 on every page, for what is only a
// stale env var. The catch below never fired because a hang is not an error.
// 2.5s is far above a healthy call (tens of ms) and far below the platform's
// middleware limit, so a sick auth host costs one slow request and then
// renders signed-out instead of taking the site down.
const AUTH_TIMEOUT_MS = 2500

function timeoutFetch(input, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  )
}

export async function middleware(request) {
  // Locale negotiation / redirect first — it may produce the response we
  // attach refreshed auth cookies to.
  const response = intlMiddleware(request)

  // Session refresh must never take the site down: if Supabase is
  // misconfigured or unreachable, serve the page and let route-level auth
  // checks handle the rest.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (url && anonKey) {
      const supabase = createServerClient(url, anonKey, {
        global: { fetch: timeoutFetch },
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      })
      // Refreshes the session cookie if expired; must be awaited in middleware.
      await supabase.auth.getUser()
    }
  } catch (e) {
    console.error('middleware auth refresh failed:', e?.message)
  }

  return response
}

export const config = {
  matcher: [
    // All page routes except Next internals, API routes and static files.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}
