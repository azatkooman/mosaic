import { NextResponse } from 'next/server'

// In-memory sliding window store
const tracker = new Map()

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, timestamps] of tracker.entries()) {
    const valid = timestamps.filter((t) => now - t < 3600000)
    if (valid.length === 0) {
      tracker.delete(key)
    } else {
      tracker.set(key, valid)
    }
  }
}, 300000)

/**
 * Helper to enforce rate limiting on Next.js API routes.
 *
 * @param {Request} request
 * @param {{ limit?: number, windowMs?: number, keyPrefix?: string }} opts
 * @returns {NextResponse | null} Returns a 429 response if rate limited, or null if allowed.
 */
export function enforceRateLimit(request, opts = {}) {
  const limit = opts.limit ?? 20 // Max requests per window
  const windowMs = opts.windowMs ?? 60000 // Window duration in ms (default 1 min)
  const keyPrefix = opts.keyPrefix ?? 'global'

  // Extract client IP address
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : request.headers.get('x-real-ip') || '127.0.0.1'
  const key = `${keyPrefix}:${ip}`

  const now = Date.now()
  const timestamps = tracker.get(key) || []
  const windowStart = now - windowMs

  // Filter timestamps within the current window
  const recent = timestamps.filter((t) => t > windowStart)

  if (recent.length >= limit) {
    const oldest = recent[0]
    const resetTimeSec = Math.ceil((oldest + windowMs - now) / 1000)
    return NextResponse.json(
      { error: 'too_many_requests', retryAfter: resetTimeSec },
      {
        status: 429,
        headers: {
          'Retry-After': String(resetTimeSec),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((now + resetTimeSec * 1000) / 1000)),
        },
      }
    )
  }

  recent.push(now)
  tracker.set(key, recent)
  return null
}
