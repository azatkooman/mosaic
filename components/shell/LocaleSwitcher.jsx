'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/lib/i18n/navigation'
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales'

export function LocaleSwitcher({ label, locales = LOCALES }) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  return (
    <select
      className="select-native"
      style={{ width: 'auto', paddingBlock: '0.3rem' }}
      aria-label={label}
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value })}
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  )
}
