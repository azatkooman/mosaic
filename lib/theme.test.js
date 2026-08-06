import { describe, it, expect } from 'vitest'
import { normalizeTheme, resolveThemeState } from './theme.js'

describe('normalizeTheme', () => {
  it('passes through the supported values', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('system')).toBe('system')
  })

  it('falls back to system for anything else', () => {
    for (const v of ['', 'DARK', 'auto', null, undefined, 0]) {
      expect(normalizeTheme(v)).toBe('system')
    }
  })
})

describe('resolveThemeState', () => {
  it('reports an explicit choice as both the preference and what is applied', () => {
    expect(resolveThemeState('dark', false)).toEqual({ preference: 'dark', applied: 'dark' })
    expect(resolveThemeState('light', true)).toEqual({ preference: 'light', applied: 'light' })
  })

  it('an explicit choice overrides the OS setting', () => {
    // The bug this guards: the toggle showed a sun while the site was dark.
    expect(resolveThemeState('dark', false).applied).toBe('dark')
    expect(resolveThemeState('light', true).applied).toBe('light')
  })

  it('no attribute means "system", resolved against the OS', () => {
    expect(resolveThemeState(undefined, true)).toEqual({ preference: 'system', applied: 'dark' })
    expect(resolveThemeState(undefined, false)).toEqual({ preference: 'system', applied: 'light' })
    expect(resolveThemeState('', true)).toEqual({ preference: 'system', applied: 'dark' })
  })

  it('treats an unrecognised attribute as system rather than trusting it', () => {
    expect(resolveThemeState('midnight', true)).toEqual({ preference: 'system', applied: 'dark' })
  })

  it('preference and applied only diverge under system', () => {
    for (const [attr, osDark] of [['dark', true], ['dark', false], ['light', true], ['light', false]]) {
      const s = resolveThemeState(attr, osDark)
      expect(s.preference).toBe(s.applied)
    }
    expect(resolveThemeState(null, true)).toEqual({ preference: 'system', applied: 'dark' })
  })
})
