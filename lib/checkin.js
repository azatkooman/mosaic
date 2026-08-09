/**
 * Extract the opaque ticket code from a scanned QR payload.
 *
 * Tickets encode `<origin>/t/<code>`, but be liberal in what we accept: the
 * URL may carry a locale prefix (middleware redirects add one), query/hash
 * junk from camera apps, or a staff member may paste the bare code.
 */
export function ticketCodeFromScan(text) {
  if (typeof text !== 'string') return null
  const s = text.trim()
  const m = s.match(/\/t\/([A-Za-z0-9_-]{8,64})(?:[/?#]|$)/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{8,64}$/.test(s)) return s
  return null
}
