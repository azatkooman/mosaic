import { vi } from 'vitest'

// A stand-in for the browser Supabase client that records every
// from(table).update(patch) and resolves the chain the way PostgREST does.
// `result` is what an awaited update (or its .select()) settles to.
export function fakeSupabase(result = { data: [{ id: 'u1' }], error: null }) {
  const updates = []
  const chain = {
    eq: () => chain,
    select: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return {
    updates,
    client: {
      from: vi.fn((table) => ({
        update: (patch) => {
          updates.push({ table, patch })
          return chain
        },
      })),
    },
  }
}
