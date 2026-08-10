import { describe, expect, test } from 'vitest'
import { slugBase, uniqueSlug } from './slug'

describe('slugBase', () => {
  test('lowercases and hyphenates', () => {
    expect(slugBase('Fall Retreat 2026')).toBe('fall-retreat-2026')
    expect(slugBase('  Winter   Conference  ')).toBe('winter-conference')
  })

  test('strips accents rather than dropping the letters', () => {
    expect(slugBase('Café Ärger')).toBe('cafe-arger')
  })

  test('collapses punctuation and trims stray hyphens', () => {
    expect(slugBase('NW Wisconsin — Fall Retreat!')).toBe('nw-wisconsin-fall-retreat')
    expect(slugBase('--edges--')).toBe('edges')
  })

  test('returns empty for a name with no latin characters', () => {
    // Callers substitute a fallback; the clone RPC would reject '' as invalid.
    expect(slugBase('Конференция')).toBe('')
    expect(slugBase('')).toBe('')
    expect(slugBase(null)).toBe('')
  })
})

describe('uniqueSlug', () => {
  test('suffixes the base so two events with one name do not collide', () => {
    const a = uniqueSlug('Fall Retreat')
    expect(a).toMatch(/^fall-retreat-[a-z0-9]+$/)
  })

  test('falls back to "event" for a non-latin name', () => {
    expect(uniqueSlug('Конференция')).toMatch(/^event-[a-z0-9]+$/)
  })

  test('always satisfies the slug pattern the clone RPC enforces', () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
    for (const name of ['Café Ärger', 'NW Wisconsin — Fall Retreat!', 'Конференция', '  ']) {
      expect(uniqueSlug(name)).toMatch(pattern)
    }
  })
})
