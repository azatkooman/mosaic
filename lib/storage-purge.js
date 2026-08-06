// @ts-check
/**
 * Storage cleanup for permanent deletion.
 *
 * Purging rows cannot reclaim uploaded files: Supabase keeps them in
 * `storage.objects`, which has no foreign key to `participants` or `events` —
 * the only link is a path convention. So a purge that only ran SQL would leave
 * the bytes behind, still billed for and, in the case of the PUBLIC
 * `event-covers` bucket, still downloadable by anyone holding the URL.
 *
 * Both buckets namespace by event id, which is what makes an event-wide sweep
 * possible:
 *
 *   event-covers        {event_id}/{prefix}-{ts}.{ext}
 *   registration-files  {event_id}/{user_id}/{uuid}-{filename}
 *
 * Everything here needs a service-role client: the storage RLS policies gate
 * on organizer privileges, and the caller's own rows are being deleted out
 * from under them anyway.
 */

export const COVERS_BUCKET = 'event-covers'
export const REGFILES_BUCKET = 'registration-files'

// Supabase caps a list() page; loop until a short page comes back.
const PAGE = 100

/**
 * File-answer paths for a set of participants.
 *
 * Driven by each participant's OWN form version, not the form's current one:
 * a question may since have been deleted or retyped, and the answer still
 * points at a real object.
 *
 * @param {Array<{answers?: Object, form_versions?: {definition?: {questions?: Array<any>}}}>} participants
 * @returns {string[]} deduplicated storage paths
 */
export function collectParticipantFilePaths(participants = []) {
  const paths = new Set()
  for (const p of participants) {
    const questions = p?.form_versions?.definition?.questions ?? []
    for (const q of questions) {
      if (q?.type !== 'file') continue
      const value = p?.answers?.[q.id]
      if (typeof value === 'string' && value.trim() !== '') paths.add(value)
    }
  }
  return [...paths]
}

/**
 * Every object stored under one folder, paged.
 * Returns full paths, not the bare names list() yields.
 */
async function listFolder(admin, bucket, prefix) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
    })
    if (error || !data) break
    for (const entry of data) {
      // list() returns folders too; those have no id and no metadata.
      if (entry.id == null) continue
      out.push(prefix ? `${prefix}/${entry.name}` : entry.name)
    }
    if (data.length < PAGE) break
  }
  return out
}

/**
 * Every object belonging to an event, across both buckets.
 *
 * Listed by prefix rather than derived from the event's JSON: page_content
 * references media under a scatter of keys (hero, logo, favicon, gallery,
 * speakers…), and any key missed would silently orphan a file. Sweeping the
 * folder also reclaims uploads that were never saved onto the event.
 *
 * registration-files nests one level deeper (a folder per registrant), and
 * list() is not recursive, so that level is walked explicitly.
 *
 * @returns {Promise<{covers: string[], regFiles: string[]}>}
 */
export async function listEventStoragePaths(admin, eventId) {
  const covers = await listFolder(admin, COVERS_BUCKET, eventId)

  const regFiles = []
  const { data: userFolders } = await admin.storage
    .from(REGFILES_BUCKET)
    .list(eventId, { limit: PAGE })
  for (const folder of userFolders ?? []) {
    // A folder entry, i.e. one registrant's uploads.
    if (folder.id != null) {
      regFiles.push(`${eventId}/${folder.name}`)
      continue
    }
    regFiles.push(...(await listFolder(admin, REGFILES_BUCKET, `${eventId}/${folder.name}`)))
  }

  return { covers, regFiles }
}

/**
 * Remove paths from a bucket, in chunks, never throwing.
 *
 * Storage failures must not fail the request: by the time this runs the rows
 * are already gone and cannot be brought back, so the useful outcome is to
 * report what was left behind rather than to report an error for work that
 * mostly succeeded.
 *
 * @returns {Promise<{removed: number, failed: string[]}>}
 */
export async function removePaths(admin, bucket, paths) {
  const unique = [...new Set((paths ?? []).filter((p) => typeof p === 'string' && p !== ''))]
  let removed = 0
  const failed = []
  for (let i = 0; i < unique.length; i += PAGE) {
    const chunk = unique.slice(i, i + PAGE)
    try {
      const { data, error } = await admin.storage.from(bucket).remove(chunk)
      if (error) failed.push(...chunk)
      else removed += data?.length ?? chunk.length
    } catch {
      failed.push(...chunk)
    }
  }
  return { removed, failed }
}
