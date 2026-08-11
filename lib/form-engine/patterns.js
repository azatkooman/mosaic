// @ts-check
/**
 * Named regex presets for the `pattern` validation rule.
 *
 * A raw regex box is a footgun in an authoring UI: validate.js deliberately
 * swallows a pattern that fails to compile (an authoring typo must never block
 * a registrant), so a malformed pattern looks set and silently never fires.
 * Presets give organizers the common cases without that trap, and `custom`
 * keeps the escape hatch for the rare author who really does want a regex.
 *
 * Sources use `\p{L}` / `\p{N}` — validate.js compiles in unicode mode first,
 * so these accept every script the platform ships (ru/uk included), not just
 * ASCII.
 */

export const PATTERN_PRESETS = [
  { key: 'none', source: undefined },
  // Names: letters plus the separators that legitimately appear in them
  // (spaces, hyphens, straight and curly apostrophes).
  { key: 'lettersOnly', source: "^[\\p{L}\\s'’-]+$" },
  { key: 'digitsOnly', source: '^[0-9]+$' },
  { key: 'alphanumeric', source: '^[\\p{L}\\p{N}]+$' },
  { key: 'noSpaces', source: '^\\S+$' },
]

/** Preset key for a stored pattern source — 'none' when unset, 'custom' when unrecognized. */
export function presetKeyFor(source) {
  if (!source) return 'none'
  return PATTERN_PRESETS.find((p) => p.source === source)?.key ?? 'custom'
}

/** Pattern source for a preset key. `custom` keeps whatever is already stored. */
export function patternSourceFor(key, currentSource) {
  if (key === 'custom') return currentSource ?? ''
  return PATTERN_PRESETS.find((p) => p.key === key)?.source
}

/** Every selectable key, including `custom` (which has no fixed source). */
export const PATTERN_PRESET_KEYS = [...PATTERN_PRESETS.map((p) => p.key), 'custom']
