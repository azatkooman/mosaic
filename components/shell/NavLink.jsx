'use client'

import { Link, usePathname } from '@/lib/i18n/navigation'

/** A nav Link that marks itself aria-current="page" when it matches the
 *  current route, so CSS can underline the selected item. */
export function NavLink({ href, children, className }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
  return (
    <Link href={href} className={className} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  )
}
