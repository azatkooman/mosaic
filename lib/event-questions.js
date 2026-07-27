// @ts-check
/**
 * The question columns an event's participant list and export should show.
 *
 * An event accumulates many `form_versions` — one per edit, across possibly
 * several forms (a single-mode form, a family-mode form, per-type forms).
 * Both callers used to union questions across EVERY version, which produced
 * two bugs:
 *
 *   1. Phantom columns. A question deleted from the form still lived on in
 *      the superseded version, so it kept its column forever — e.g. a `Name`
 *      and `Email` pair removed in v2 still appeared after every real column.
 *   2. Stale labels. The first version encountered won, and version order
 *      from PostgREST is arbitrary, so a renamed question could be headed by
 *      any of its historical labels rather than its current one.
 *
 * Only the CURRENT published version of each form describes what the event
 * asks today, so that is what both surfaces render. Answers to questions
 * since removed from a form stay in `participants.answers` and remain visible
 * in the participant detail drawer (which renders against the exact version
 * the participant answered) — they just no longer get a column of their own.
 */

/**
 * @param {Array<{id:string, definition?:{questions?:Array<any>}, forms?:{current_version_id?:string|null}}>} versions
 *   Rows from `form_versions` joined to their form's `current_version_id`.
 * @returns {Array<any>} question objects, first occurrence per id
 */
export function eventQuestionColumns(versions = []) {
  const byId = new Map()
  for (const v of versions) {
    // Skip superseded and draft versions: only what the form asks now.
    if (!v?.forms?.current_version_id || v.id !== v.forms.current_version_id) continue
    for (const q of v.definition?.questions ?? []) {
      // Sections are layout, not data; archived questions are hidden from the
      // form but kept so old answers still render in the drawer.
      if (q.type === 'section' || q.archived) continue
      if (!byId.has(q.id)) byId.set(q.id, q)
    }
  }
  return [...byId.values()]
}

/** The two participant lists the console shows, in tab order. */
export const PARTICIPANT_BUCKETS = ['individual', 'group']

/**
 * Which list a form version's participants belong to.
 *
 * `forms.registration_mode` is the switch the respondent actually flipped:
 * 'family' means they registered a group, 'single' means only themself. A null
 * mode is a per-type or Default form, which stands in when the event defines no
 * mode forms at all — those participants are individuals.
 *
 * @param {{forms?:{registration_mode?:string|null}}} version
 * @returns {'individual'|'group'}
 */
export function versionBucket(version) {
  return version?.forms?.registration_mode === 'family' ? 'group' : 'individual'
}

/**
 * Partition an event's form versions into the individual and group lists.
 *
 * Each bucket carries its own columns AND its own `versionIds`, and the two are
 * used together: the columns come from the CURRENT version of the bucket's
 * forms (see `eventQuestionColumns`), while `versionIds` spans EVERY version of
 * those forms, because a participant may have answered a since-superseded one
 * and still belongs in that bucket. Because the buckets draw on disjoint sets
 * of forms, no answer column is ever shared between the two tables.
 *
 * @param {Array<{id:string, definition?:{questions?:Array<any>},
 *   forms?:{current_version_id?:string|null, registration_mode?:string|null}}>} versions
 * @returns {{individual:{questions:Array<any>, versionIds:string[]},
 *            group:{questions:Array<any>, versionIds:string[]}}}
 */
export function eventQuestionBuckets(versions = []) {
  const split = { individual: [], group: [] }
  for (const v of versions) {
    if (v?.id) split[versionBucket(v)].push(v)
  }
  return {
    individual: {
      questions: eventQuestionColumns(split.individual),
      versionIds: split.individual.map((v) => v.id),
    },
    group: {
      questions: eventQuestionColumns(split.group),
      versionIds: split.group.map((v) => v.id),
    },
  }
}
