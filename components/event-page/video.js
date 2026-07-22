// Helpers to turn user-pasted media/map links into embeddable sources.

/**
 * Resolve a pasted video URL into something renderable.
 * Returns { type: 'iframe', src } for YouTube/Vimeo links,
 * { type: 'video', src } for direct video files, or null.
 */
export function videoEmbedSrc(url) {
  if (!url || typeof url !== 'string') return null
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return null

  // YouTube: watch?v=, youtu.be/, shorts/, embed/
  const yt =
    u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i)
  if (yt) return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` }

  const vimeo = u.match(/vimeo\.com\/(\d+)/i)
  if (vimeo) return { type: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` }

  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(u)) return { type: 'video', src: u }

  return null
}

/**
 * Resolve a Google Maps link (embed, place, or share) — or a plain address —
 * into an iframe-safe embed URL. Regular maps links refuse to load in an
 * iframe, so anything that isn't already an embed URL is converted to the
 * keyless `output=embed` form.
 */
export function mapEmbedSrc(embedUrl, address) {
  const u = (embedUrl ?? '').trim()
  if (u) {
    if (u.includes('/maps/embed') || u.includes('output=embed')) return u
    const place = u.match(/\/maps\/place\/([^/?]+)/)
    if (place) return `https://maps.google.com/maps?q=${place[1]}&output=embed`
    const query = u.match(/[?&]q=([^&]+)/)
    if (query) return `https://maps.google.com/maps?q=${query[1]}&output=embed`
  }
  if (address) return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
  return null
}
