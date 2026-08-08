import { describe, expect, it } from 'vitest'
import { planTypeWrites } from './participant-type-save'

const saved = [
  { id: 'a', key: 'staff', name: { en: 'Staff' }, capacity: 10, form_id: 'f1' },
  { id: 'b', key: 'child', name: { en: 'Child' }, capacity: null, form_id: 'f1' },
]

const actions = (types, base = saved) => planTypeWrites(types, base).map((p) => p.action)

describe('planTypeWrites', () => {
  it('inserts a staged type and leaves the untouched ones alone', () => {
    const staged = { id: 'new-abc', isNew: true, key: 'guest', name: { en: 'Guest' } }
    expect(actions([...saved, staged])).toEqual(['skip', 'skip', 'insert'])
  })

  it('writes nothing when nothing changed', () => {
    expect(actions(saved)).toEqual(['skip', 'skip'])
  })

  it('updates a renamed type, including a name gaining a translation', () => {
    const renamed = { ...saved[0], name: { en: 'Staff', th: 'พนักงาน' } }
    expect(actions([renamed, saved[1]])).toEqual(['update', 'skip'])
  })

  it('updates on a capacity or form change, not just a rename', () => {
    expect(actions([{ ...saved[0], capacity: 20 }, saved[1]])).toEqual(['update', 'skip'])
    expect(actions([saved[0], { ...saved[1], form_id: 'f2' }])).toEqual(['skip', 'update'])
  })

  // The distinction that matters most: getting it backwards either loses the
  // type or creates a duplicate.
  it('keys off isNew, never off the shape of the id', () => {
    // A staged row whose placeholder id happens to collide with a saved one is
    // still an insert...
    expect(actions([{ id: 'a', isNew: true, key: 'x', name: {} }])).toEqual(['insert'])
    // ...and a real row is an update even though its id looks like a placeholder.
    expect(actions([{ id: 'new-abc', key: 'x', name: {} }])).toEqual(['update'])
  })

  // After a save that failed partway, the rows already written are in the
  // database but not yet in the baseline. They must update, not insert again.
  it('updates a persisted row that is missing from the baseline', () => {
    const justInserted = { id: 'c', key: 'guest', name: { en: 'Guest' } }
    expect(actions([justInserted], saved)).toEqual(['update'])
  })

  it('preserves order and returns the type alongside each action', () => {
    const staged = { id: 'new-1', isNew: true, key: 'guest', name: {} }
    const plan = planTypeWrites([staged, saved[0]], saved)
    expect(plan.map((p) => p.type.key)).toEqual(['guest', 'staff'])
  })

  it('tolerates an empty or missing baseline', () => {
    expect(actions([saved[0]], [])).toEqual(['update'])
    expect(planTypeWrites([], undefined)).toEqual([])
    expect(planTypeWrites(undefined)).toEqual([])
  })
})
