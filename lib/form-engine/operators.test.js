import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  OPERATORS_BY_TYPE,
  operatorsForType,
  operatorLabelKey,
  isOperatorAllowed,
  defaultOperatorFor,
} from './operators.js'
import { evaluateRule } from './conditions.js'

const LOCALES = ['en', 'es', 'fr', 'ru', 'uk']
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url)))])
)

const ALL_TYPES = Object.keys(OPERATORS_BY_TYPE)

describe('operator menus', () => {
  it('offers something for every question type that can be referenced', () => {
    for (const type of ALL_TYPES) {
      expect(operatorsForType(type).length, type).toBeGreaterThan(0)
    }
  })

  it('never offers an operator the engine cannot satisfy for that type', () => {
    // A multiselect answer is an array. evaluateRule refuses arrays outright
    // for eq/neq, and stringifies them for in/notIn ("a,b"), so none of the
    // four discriminates: whatever the organizer picks as the value, eq/neq/in
    // stay false and notIn stays true. Offering them was a trap.
    const rule = (operator, value) => evaluateRule(['a', 'b'], { questionId: 'x', operator, value })
    for (const op of ['eq', 'neq', 'in', 'notIn']) {
      expect(operatorsForType('multiselect'), op).not.toContain(op)
    }
    expect(rule('eq', 'a')).toBe(false)
    expect(rule('neq', 'a')).toBe(false)
    expect(rule('in', ['a', 'b'])).toBe(false)
    expect(rule('notIn', ['a', 'b'])).toBe(true) // "matches" even though it shouldn't

    // ...whereas the one operator it does offer actually works.
    expect(rule('contains', 'a')).toBe(true)
    expect(rule('contains', 'z')).toBe(false)
  })

  it('keeps an existing rule\'s operator even when the type would not offer it', () => {
    expect(operatorsForType('multiselect')).not.toContain('eq')
    expect(operatorsForType('multiselect', 'eq')).toContain('eq')
  })

  it('re-points an operator when the watched question type changes', () => {
    expect(isOperatorAllowed('contains', 'date')).toBe(false)
    expect(isOperatorAllowed('gt', 'date')).toBe(true)
    expect(defaultOperatorFor('multiselect')).toBe('contains')
    expect(defaultOperatorFor('checkbox')).toBe('isNotEmpty')
    // Unknown type degrades to the always-valid presence pair.
    expect(operatorsForType('nope')).toEqual(['isEmpty', 'isNotEmpty'])
  })
})

describe('operator labels', () => {
  it('has a label in every locale for every operator/type pair offered', () => {
    const missing = []
    for (const type of ALL_TYPES) {
      for (const op of operatorsForType(type)) {
        const key = operatorLabelKey(op, type)
        for (const l of LOCALES) {
          const label = messages[l].operators?.[key]
          if (!label) missing.push(`${l}.operators.${key} (${type}/${op})`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('reads as plain language, not as engine keys', () => {
    const en = messages.en.operators
    expect(en.neq).toBe('is not')
    expect(en.notIn).toBe('is none of')
    expect(en.gte).toBe('is greater than or equal to')
    // No label may leak a raw engine identifier. ("contains" is exempt — the
    // engine key happens to already be the plain English word.)
    const CODEY = /^(eq|neq|in|notIn|gt|gte|lt|lte|isEmpty|isNotEmpty)$/
    for (const [key, label] of Object.entries(en)) {
      expect(CODEY.test(label), `${key} = ${label}`).toBe(false)
    }
  })

  it('words comparisons for the type being compared', () => {
    const en = messages.en.operators
    expect(en[operatorLabelKey('gt', 'date')]).toBe('is after')
    expect(en[operatorLabelKey('gt', 'number')]).toBe('is greater than')
    expect(en[operatorLabelKey('contains', 'multiselect')]).toBe('includes')
    expect(en[operatorLabelKey('isNotEmpty', 'checkbox')]).toBe('is checked')
    expect(en[operatorLabelKey('isNotEmpty', 'file')]).toBe('has a file')
  })

  it('carries no orphan labels', () => {
    const used = new Set(
      ALL_TYPES.flatMap((type) => operatorsForType(type).map((op) => operatorLabelKey(op, type)))
    )
    expect([...Object.keys(messages.en.operators)].filter((k) => !used.has(k))).toEqual([])
  })
})
