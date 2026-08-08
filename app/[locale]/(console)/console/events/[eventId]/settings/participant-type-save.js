// @ts-check
/**
 * What the settings form has to write for each participant type.
 *
 * Adding a type used to INSERT immediately and then re-baseline the dirty
 * snapshot, which left Save disabled — so the row existed on the event but never
 * went through save(), and save() is what auto-translates the names. A new type
 * was therefore permanently untranslated unless the organizer happened to edit
 * something else afterwards. Types are now staged locally and written here.
 *
 * Split out from the form because getting this wrong is expensive in both
 * directions — an insert misread as an update loses the type, an update misread
 * as an insert duplicates it — and this project has no jsdom, so the component
 * itself cannot be exercised in a test.
 */

/**
 * @param {Array<{id?: string, isNew?: boolean, key?: string, name?: Object,
 *   capacity?: number|null, form_id?: string|null}>} types  in display order
 * @param {Array<Object>} savedTypes  the rows as last persisted
 * @returns {Array<{action: 'insert'|'update'|'skip', type: Object}>}
 *   one entry per input type, in the same order
 */
export function planTypeWrites(types, savedTypes = []) {
  return (types ?? []).map((type) => {
    // Staged by addType and never persisted. Keyed off an explicit flag rather
    // than the shape of `id`, so a placeholder id can never be mistaken for a
    // real one (or the reverse) by a change to how ids are generated.
    if (type.isNew) return { action: 'insert', type }

    const original = (savedTypes ?? []).find((o) => o.id === type.id)
    // No baseline row means we cannot prove it is unchanged — write it. This is
    // also the path a row takes after a partial save, where it is already in the
    // database but not yet in the baseline; an update then is idempotent, which
    // a second insert would not be.
    const changed =
      !original ||
      original.key !== type.key ||
      original.capacity !== type.capacity ||
      original.form_id !== type.form_id ||
      JSON.stringify(original.name) !== JSON.stringify(type.name)

    return { action: changed ? 'update' : 'skip', type }
  })
}
