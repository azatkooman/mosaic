import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The href is the whole component, so the mock records it verbatim rather than
// rendering it: next-intl's Link takes an object href and resolves the locale
// prefix itself, and asserting on the final URL would be testing next-intl.
let pathname = '/'
vi.mock('@/lib/i18n/navigation', () => ({
  usePathname: () => pathname,
  Link: ({ href, className, children }) => (
    <a data-href={JSON.stringify(href)} className={className}>
      {children}
    </a>
  ),
}))

const { ProfileLink } = await import('./ProfileLink')

const hrefFrom = (at) => {
  pathname = at
  const markup = renderToStaticMarkup(<ProfileLink className="btn">Profile</ProfileLink>)
  return JSON.parse(markup.match(/data-href="([^"]*)"/)[1].replaceAll('&quot;', '"'))
}

describe('ProfileLink', () => {
  it('records where it was clicked from', () => {
    expect(hrefFrom('/console/events/abc/forms')).toEqual({
      pathname: '/my/profile',
      query: { next: '/console/events/abc/forms' },
    })
  })

  it('carries no origin when already on the profile page', () => {
    // Otherwise saving the language re-navigates to /my/profile?next=/my/profile
    // and the Back button points at the page it is already on.
    expect(hrefFrom('/my/profile')).toBe('/my/profile')
  })

  it('records the site root like any other origin', () => {
    // '/' is falsy-adjacent but a real page — the home page is where most
    // registrants reach Profile from.
    expect(hrefFrom('/')).toEqual({ pathname: '/my/profile', query: { next: '/' } })
  })

  it('falls back to a bare link when there is no pathname', () => {
    expect(hrefFrom('')).toBe('/my/profile')
  })
})
