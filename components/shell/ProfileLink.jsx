'use client'

import { Link, usePathname } from '@/lib/i18n/navigation'

/**
 * The header's Profile link, carrying where it was clicked from.
 *
 * Profile is reachable from every shell (site, console, admin) but is not part
 * of any of them, so there is no nav to return through: an organizer who dips
 * into it from a half-finished event form otherwise walks back via the events
 * hub. The link records its origin in `?next=` and the profile page renders a
 * Back button from it.
 *
 * `next` rather than the browser's history: the button then means the same
 * thing on a reload, on a shared URL and after the language switch below
 * re-navigates the page — and it can be validated (see `safeNextPath`), which
 * `history.back()` cannot be. The cost is that Back only appears when the user
 * arrived by this link, which is the honest answer — typing the URL directly
 * leaves nowhere to go back TO.
 *
 * The path only, never the query string: this link exists only in shells that
 * render a site header, and the pages that carry meaningful query state (the
 * event page and its registration wizard, with `?lang=` and `?type=`) have
 * their own header-less layout, so there is nothing to preserve. Taking
 * `usePathname` from lib/i18n/navigation also keeps the value locale-free,
 * which is what `Link` wants back.
 */
export function ProfileLink({ className, children }) {
  const pathname = usePathname()
  const from = pathname && pathname !== '/my/profile' ? pathname : null

  return (
    <Link
      href={from ? { pathname: '/my/profile', query: { next: from } } : '/my/profile'}
      className={className}
    >
      {children}
    </Link>
  )
}
