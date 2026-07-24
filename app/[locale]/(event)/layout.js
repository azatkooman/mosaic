// Standalone layout for public event pages: no site header/nav, so the event
// page reads as its own site. The [locale] layout above still provides html,
// fonts and the intl/date-format providers.
export default function EventLayout({ children }) {
  return <main>{children}</main>
}
