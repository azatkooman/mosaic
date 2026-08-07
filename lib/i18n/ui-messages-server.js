// @ts-check
/**
 * Server-side read of the cached platform UI text (see ./ui-messages.js for
 * what it is and why it exists, and migration 0037 for the table).
 *
 * Kept apart from ui-messages.js so that module stays pure and importable from
 * the browser and from tests; everything here touches Supabase or next-intl's
 * request scope.
 */

import { cache } from 'react'
import { getMessages } from 'next-intl/server'
import { getSupabaseAnonClient } from '../supabase/server'
import { LOCALES } from './locales'
import { mergeMessages } from './ui-messages'

/**
 * Cached UI messages for one language, or null when there are none.
 *
 * Wrapped in React's `cache` so a page that needs both the server-rendered
 * strings and the client bundle reads the row once per request.
 *
 * Uses the ANON client on purpose: the table is world-readable (it is our own
 * UI text) and the public event page renders with no session at all, so the
 * cookie-bound client would be the wrong tool and would opt the page out of
 * static rendering.
 *
 * Never queries for a platform locale — those five are hand-translated in the
 * repo and must not be served from a machine-translated cache.
 *
 * @param {string|null|undefined} code
 * @returns {Promise<Object|null>}
 */
export const getUiTranslations = cache(async (code) => {
  if (typeof code !== 'string' || code === '' || LOCALES.includes(code)) return null
  try {
    const supabase = getSupabaseAnonClient()
    const { data } = await supabase
      .from('ui_translations')
      .select('messages')
      .eq('code', code)
      .maybeSingle()
    const messages = data?.messages
    return messages && typeof messages === 'object' && !Array.isArray(messages) ? messages : null
  } catch {
    // A missing table (migration not yet applied) or an unreachable database
    // must not take a public event page down — the caller falls back to the
    // route locale's catalog, which is what rendered before this existed.
    return null
  }
})

/**
 * The message catalog to render a page's chrome with.
 *
 * Returns the request's own messages untouched when `contentLocale` is a
 * platform locale — a built-in language owns its route, so next-intl has
 * already resolved the right catalog and there is nothing to do. For a custom
 * language it lays the cached translations over that catalog, so any key the
 * cache lacks still resolves to the route locale's wording.
 *
 * `changed` tells the caller whether wrapping a provider is worth it at all.
 *
 * @param {string|null|undefined} contentLocale
 * @returns {Promise<{messages: Object, changed: boolean}>}
 */
export async function getContentMessages(contentLocale) {
  const base = await getMessages()
  const overrides = await getUiTranslations(contentLocale)
  if (!overrides) return { messages: base, changed: false }
  const merged = mergeMessages(base, overrides)
  return { messages: merged, changed: merged !== base }
}
