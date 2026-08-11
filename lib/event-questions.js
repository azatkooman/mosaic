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

/**
 * Which form each question column came from, for disambiguating headers.
 *
 * Only needed by the merged All list: two forms on one event routinely ask the
 * same thing under different question ids — on production `tech-conference-2026`
 * the Default form and the Single response form each define their own
 * "Address", "Email" and "Phone" — and unioning them yields two columns with
 * identical headers and no way to tell which is which.
 *
 * @param {Array<{id:string, definition?:{questions?:Array<any>},
 *   forms?:{current_version_id?:string|null, title?:string|null}}>} versions
 * @returns {Map<string,string>} question id → form title
 */
export function questionFormTitles(versions = []) {
  const byId = new Map()
  for (const v of versions) {
    if (!v?.forms?.current_version_id || v.id !== v.forms.current_version_id) continue
    for (const q of v.definition?.questions ?? []) {
      if (q.type === 'section' || q.archived) continue
      if (!byId.has(q.id) && v.forms.title) byId.set(q.id, v.forms.title)
    }
  }
  return byId
}

/**
 * Column headers for a question list, with collisions qualified by form.
 *
 * `resolve` turns a question into its localized label, so this stays free of
 * both the locale and next-intl — the console passes one closure and the
 * export another, and the two can never drift apart.
 *
 * A label is only qualified when it actually collides. Doing it unconditionally
 * would put "(Registration form)" after all nine of i-go-tech-track's columns,
 * where nothing is ambiguous.
 *
 * @param {Array<any>} questions
 * @param {Map<string,string>|Record<string,string>} formTitles from
 *   questionFormTitles — a plain object too, since the console receives it
 *   across the server/client boundary where a Map cannot be serialized.
 * @param {(q:any)=>string} resolve question → localized label
 * @returns {string[]} one header per question, in order
 */
export function questionHeaders(questions = [], formTitles = new Map(), resolve = () => '') {
  const titleOf = (id) =>
    formTitles instanceof Map ? formTitles.get(id) : formTitles?.[id]
  const raw = questions.map((q) => resolve(q) || q.id)
  const seen = new Map()
  for (const label of raw) seen.set(label, (seen.get(label) ?? 0) + 1)
  return questions.map((q, i) => {
    const label = raw[i]
    const title = titleOf(q.id)
    return seen.get(label) > 1 && title ? `${label} (${title})` : label
  })
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
 * and still belongs in that bucket.
 *
 * The `all` bucket is the two merged, and it is a real union rather than an
 * empty set because the buckets being drawn from disjoint FORMS does not make
 * their QUESTIONS disjoint. A group form is normally cloned from the single
 * form and keeps its question ids: on production, i-go-tech-track's individual
 * and group forms share all nine, and thai-ccci-staff-conference shares three
 * of its twelve. Deduplicating by id therefore merges those columns instead of
 * doubling them, and the merged list is mostly populated — the All tab used to
 * show no answer columns at all on the theory that it could not be.
 *
 * Individual comes first in the union so the shared columns of the list most
 * events have keep their familiar order, with group-only columns appended.
 *
 * @param {Array<{id:string, definition?:{questions?:Array<any>},
 *   forms?:{current_version_id?:string|null, registration_mode?:string|null}}>} versions
 * @returns {{individual:{questions:Array<any>, versionIds:string[]},
 *            group:{questions:Array<any>, versionIds:string[]},
 *            all:{questions:Array<any>, versionIds:string[]}}}
 */
export function eventQuestionBuckets(versions = []) {
  const split = { individual: [], group: [] }
  for (const v of versions) {
    if (v?.id) split[versionBucket(v)].push(v)
  }
  const individual = {
    questions: eventQuestionColumns(split.individual),
    versionIds: split.individual.map((v) => v.id),
  }
  const group = {
    questions: eventQuestionColumns(split.group),
    versionIds: split.group.map((v) => v.id),
  }
  // eventQuestionColumns already keeps the first occurrence per id, so handing
  // it both halves at once does the deduplication — no second merge rule to
  // keep in step with it.
  const all = {
    questions: eventQuestionColumns([...split.individual, ...split.group]),
    versionIds: [...individual.versionIds, ...group.versionIds],
  }
  return { individual, group, all }
}
