// @ts-check
/**
 * Which worksheets a participant export is made of.
 *
 * Split out of the route so the decisions can be tested without a Supabase
 * session, an event, or ExcelJS — the route's own body is one auth gate and a
 * paging loop, and neither is where this gets interesting.
 */

/** Bucket → the console key naming its tab, reused as the sheet name. */
export const BUCKET_LABEL_KEY = {
  all: 'bucketAll',
  individual: 'bucketIndividual',
  group: 'bucketGroup',
}

/**
 * An xlsx from the All tab is the "everything" download, so it carries a sheet
 * per list — All first (the union, matching what the tab shows), then
 * Individual and Group with their own columns intact. Before this, exporting
 * All produced the LEAST data of the three tabs: it inherited the empty
 * question list the tab used to render.
 *
 * A bucket with no forms contributes no sheet, so an event that never ran group
 * registration does not receive an empty Group tab to explain. CSV has no
 * second sheet to put anything on, so it stays the single union table — which
 * is also the shape people pivot on.
 *
 * @param {string} bucket the requested tab: 'all' | 'individual' | 'group'
 * @param {string} format 'xlsx' | 'csv'
 * @param {{individual:{versionIds:string[]}, group:{versionIds:string[]}}} buckets
 * @returns {string[]} bucket keys, in sheet order
 */
export function sheetBucketsFor(bucket, format, buckets) {
  if (bucket !== 'all' || format !== 'xlsx') return [bucket]
  return ['all', 'individual', 'group'].filter(
    (b) => b === 'all' || (buckets?.[b]?.versionIds?.length ?? 0) > 0
  )
}

/**
 * Excel rejects a worksheet name over 31 characters, or containing any of
 * : \ / ? * [ ] — and these names are localized, so "Individual registrations"
 * fitting in English says nothing about the other four catalogs. Sanitizing
 * beats trusting them.
 *
 * @param {string} label
 * @returns {string}
 */
export function sheetName(label) {
  const cleaned = String(label ?? '')
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
  return cleaned || 'Sheet'
}
