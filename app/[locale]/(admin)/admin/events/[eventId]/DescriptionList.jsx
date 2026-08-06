/**
 * Label/value pairs for the read-only admin views. A <dl> rather than a table
 * because these are field descriptions, not tabular rows — and it collapses to
 * one column on a phone without needing the table-cards machinery.
 *
 * Server component: no interactivity anywhere in this section.
 */
export function DescriptionList({ rows }) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(8rem, 14rem) 1fr',
        gap: 'var(--s-2) var(--s-4)',
        margin: 0,
      }}
    >
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{row.label}</dt>
          <dd style={{ margin: 0, overflowWrap: 'break-word' }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
