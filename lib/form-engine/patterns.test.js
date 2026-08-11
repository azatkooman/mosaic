import { describe, expect, test } from 'vitest'
import {
  PATTERN_PRESETS,
  PATTERN_PRESET_KEYS,
  presetKeyFor,
  patternSourceFor,
} from './patterns'

/** Compile the way validate.js does: unicode first, plain as a fallback. */
function compile(src) {
  try {
    return new RegExp(src, 'u')
  } catch {
    return new RegExp(src)
  }
}

const withSource = PATTERN_PRESETS.filter((p) => p.source)

describe('pattern presets', () => {
  test.each(withSource)('$key compiles', ({ source }) => {
    expect(() => compile(source)).not.toThrow()
  })

  test('lettersOnly accepts non-Latin scripts and rejects digits', () => {
    const re = compile(patternSourceFor('lettersOnly'))
    // The whole reason for unicode mode: ru/uk are shipped locales.
    expect(re.test('Олена')).toBe(true)
    expect(re.test('Anne-Marie O’Brien')).toBe(true)
    expect(re.test('Ada42')).toBe(false)
  })

  test('digitsOnly, alphanumeric and noSpaces behave', () => {
    expect(compile(patternSourceFor('digitsOnly')).test('12345')).toBe(true)
    expect(compile(patternSourceFor('digitsOnly')).test('12a')).toBe(false)
    expect(compile(patternSourceFor('alphanumeric')).test('Кабінет7')).toBe(true)
    expect(compile(patternSourceFor('alphanumeric')).test('a b')).toBe(false)
    expect(compile(patternSourceFor('noSpaces')).test('one-token')).toBe(true)
    expect(compile(patternSourceFor('noSpaces')).test('two tokens')).toBe(false)
  })

  test('presetKeyFor round-trips, and unknown sources read as custom', () => {
    expect(presetKeyFor(undefined)).toBe('none')
    expect(presetKeyFor('')).toBe('none')
    for (const p of withSource) expect(presetKeyFor(p.source)).toBe(p.key)
    expect(presetKeyFor('^[A-Z]{2}$')).toBe('custom')
  })

  test('switching to custom keeps the stored source; none clears it', () => {
    expect(patternSourceFor('custom', '^x$')).toBe('^x$')
    expect(patternSourceFor('custom', undefined)).toBe('')
    expect(patternSourceFor('none', '^x$')).toBeUndefined()
  })

  test('every selectable key is offered, custom included', () => {
    expect(PATTERN_PRESET_KEYS).toContain('custom')
    expect(PATTERN_PRESET_KEYS).toContain('none')
  })
})
