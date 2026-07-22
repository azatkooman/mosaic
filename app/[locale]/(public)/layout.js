import { SiteHeader } from '@/components/shell/SiteHeader'
import { NamePrompt } from '@/components/shell/NamePrompt'

export default function PublicLayout({ children }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <NamePrompt />
    </>
  )
}
