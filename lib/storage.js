/** Public URL for a file in the public `event-covers` bucket. */
export function eventMediaUrl(path) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-covers/${path}`
}
