import { describe, expect, test } from 'vitest'
import { ticketCodeFromScan } from './checkin'

const CODE = 'a1b2c3d4e5f60718293a'

describe('ticketCodeFromScan', () => {
  test('accepts the canonical ticket URL', () => {
    expect(ticketCodeFromScan(`https://mosaic-snowy.vercel.app/t/${CODE}`)).toBe(CODE)
  })

  test('accepts a locale-prefixed URL (middleware redirect)', () => {
    expect(ticketCodeFromScan(`https://mosaic-snowy.vercel.app/ru/t/${CODE}`)).toBe(CODE)
  })

  test('tolerates trailing slash, query and hash', () => {
    expect(ticketCodeFromScan(`http://localhost:3000/t/${CODE}/`)).toBe(CODE)
    expect(ticketCodeFromScan(`http://localhost:3000/t/${CODE}?utm=x#y`)).toBe(CODE)
  })

  test('accepts a bare code with surrounding whitespace', () => {
    expect(ticketCodeFromScan(`  ${CODE}\n`)).toBe(CODE)
  })

  test('rejects unrelated payloads', () => {
    expect(ticketCodeFromScan('https://example.com/whatever')).toBeNull()
    expect(ticketCodeFromScan('WIFI:S:conf;P:pass;;')).toBeNull()
    expect(ticketCodeFromScan('short')).toBeNull()
    expect(ticketCodeFromScan(null)).toBeNull()
  })
})
