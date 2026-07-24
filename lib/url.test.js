import { describe, it, expect } from 'vitest'
import { externalHref } from './url.js'

describe('externalHref', () => {
  it('prepends https:// to a bare domain (the reported bug)', () => {
    expect(externalHref('cru.org')).toBe('https://cru.org')
    expect(externalHref('www.cru.org/give?x=1')).toBe('https://www.cru.org/give?x=1')
    expect(externalHref('  cru.org  ')).toBe('https://cru.org')
  })
  it('keeps an existing http/https scheme', () => {
    expect(externalHref('http://cru.org')).toBe('http://cru.org')
    expect(externalHref('https://cru.org/path')).toBe('https://cru.org/path')
    expect(externalHref('HTTPS://Cru.org')).toBe('HTTPS://Cru.org')
  })
  it('allows mailto/tel', () => {
    expect(externalHref('mailto:a@b.org')).toBe('mailto:a@b.org')
    expect(externalHref('tel:+15550100')).toBe('tel:+15550100')
  })
  it('handles protocol-relative URLs', () => {
    expect(externalHref('//cdn.example.com/x')).toBe('https://cdn.example.com/x')
  })
  it('rejects dangerous schemes', () => {
    expect(externalHref('javascript:alert(1)')).toBe(null)
    expect(externalHref('data:text/html,<script>')).toBe(null)
  })
  it('returns null for empty/invalid input', () => {
    expect(externalHref('')).toBe(null)
    expect(externalHref('   ')).toBe(null)
    expect(externalHref(null)).toBe(null)
    expect(externalHref(undefined)).toBe(null)
    expect(externalHref(42)).toBe(null)
  })
})
