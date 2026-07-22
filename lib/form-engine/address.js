// @ts-check
/**
 * Address question part configuration. Dependency-free (shared by the
 * browser renderer and the server-side validator).
 *
 * A question stores `addressParts: { [key]: { enabled, required } }`;
 * anything missing falls back to the US-style default below. Organizers
 * toggle parts off for formats that don't use them (e.g. postal codes).
 */

export const ADDRESS_PART_KEYS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country']

export const DEFAULT_ADDRESS_PARTS = {
  line1: { enabled: true, required: true },
  line2: { enabled: true, required: false },
  city: { enabled: true, required: true },
  state: { enabled: true, required: true },
  postalCode: { enabled: true, required: true },
  country: { enabled: false, required: false },
}

/**
 * Resolve a question's enabled parts in canonical order.
 * @param {{addressParts?: Object}} q
 * @returns {{key: string, required: boolean}[]}
 */
export function addressParts(q) {
  const config = q?.addressParts ?? {}
  return ADDRESS_PART_KEYS.filter(
    (key) => (config[key] ?? DEFAULT_ADDRESS_PARTS[key]).enabled
  ).map((key) => ({
    key,
    required: !!(config[key] ?? DEFAULT_ADDRESS_PARTS[key]).required,
  }))
}
